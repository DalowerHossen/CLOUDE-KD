// path: lib/payment/plan-rules.ts
// The rules of plans and entitlements as pure functions: the shape of a plan, which entitlement keys are switches and
// which are limits, how the database values are laid over the built-in ones, how full a quota bar is, which plan to
// offer when a feature is locked, and what a downgrade would leave over the limit. No database here.
import { z } from 'zod';
import { partialPatch } from '@/lib/security/zod-strict';
import {
  ENTITLEMENT_KEYS,
  PLANS,
  type EntitlementKey,
  type EntitlementValue,
} from '@/config/plans';
import { toInt } from '@/lib/reports/numbers';

export type KeyKind = 'switch' | 'limit';

/** A key in the built-in catalogue is a switch when its value is true or false, otherwise a limit (a number or null). */
export function keyKind(key: string): KeyKind {
  const sample = (PLANS.free.entitlements as Record<string, EntitlementValue | undefined>)[key];
  return typeof sample === 'boolean' ? 'switch' : 'limit';
}

const moneyText = z.string().regex(/^\d{1,12}(\.\d{1,4})?$/, 'Enter a price like 29 or 29.50.');

export const planInput = z
  .object({
    slug: z
      .string()
      .regex(/^[a-z][a-z0-9_]{1,30}$/, 'Use lower-case letters, digits and underscores.'),
    name: z
      .string()
      .trim()
      .min(1)
      .max(80)
      .refine((v) => !/[<>]/.test(v), { message: 'Angle brackets are not allowed.' }),
    // The admin form sends an empty box as null; no description is the empty text.
    description: z
      .string()
      .trim()
      .max(500)
      .refine((v) => !/[<>]/.test(v), { message: 'Angle brackets are not allowed.' })
      .nullable()
      .transform((v) => v ?? '')
      .default(''),
    priceMonthly: moneyText.default('0'),
    priceYearly: moneyText.default('0'),
    seatPriceMonthly: moneyText.default('0'),
    trialDays: z.number().int().min(0).max(90).default(0),
    visible: z.boolean().default(false),
    sortOrder: z.number().int().min(0).max(1000).default(100),
    badge: z
      .string()
      .trim()
      .min(1)
      .max(30)
      .refine((v) => !/[<>]/.test(v), { message: 'Angle brackets are not allowed.' })
      .nullable()
      .default(null),
  })
  .strict();
export type PlanInput = z.infer<typeof planInput>;

/** The fields that can be changed later (the slug never changes: stored plan keys point to it). */
export const planUpdateInput = partialPatch(planInput.omit({ slug: true })).strict();

export const entitlementValueSchema = z.union([
  z.boolean(),
  z.number().int().min(0).max(1_000_000_000),
  z.null(),
]);

export const entitlementsInput = z
  .object({
    values: z.record(z.string().regex(/^[a-z][a-z0-9_.]{1,60}$/), entitlementValueSchema),
    overage: z
      .record(z.string().regex(/^[a-z][a-z0-9_.]{1,60}$/), moneyText.nullable())
      .default({}),
  })
  .strict()
  .superRefine((v, ctx) => {
    for (const [key, value] of Object.entries(v.values)) {
      if (keyKind(key) === 'switch' && typeof value !== 'boolean')
        ctx.addIssue({
          code: 'custom',
          path: ['values', key],
          message: 'This feature is on or off.',
        });
      if (keyKind(key) === 'limit' && typeof value === 'boolean')
        ctx.addIssue({
          code: 'custom',
          path: ['values', key],
          message: 'This feature has a number limit, or no limit.',
        });
    }
  });
export type EntitlementsInput = z.infer<typeof entitlementsInput>;

export type EntitlementMap = Record<string, EntitlementValue>;

/** The built-in values of a plan key, or the free plan's when the key is not built in. */
export function baseEntitlements(slug: string): EntitlementMap {
  const known = (
    PLANS as Record<string, { entitlements: Record<EntitlementKey, EntitlementValue> } | undefined>
  )[slug];
  return { ...(known ?? PLANS.free).entitlements };
}

/** The built-in values with the plan's saved values on top (a saved value wins; a key not saved keeps the built-in value). */
export function mergeEntitlements(
  slug: string,
  saved: readonly { key: string; value: EntitlementValue }[],
): EntitlementMap {
  const merged = baseEntitlements(slug);
  for (const row of saved) merged[row.key] = row.value;
  return merged;
}

export function hasValue(value: EntitlementValue | undefined): boolean {
  return value === true || value === null || (typeof value === 'number' && value > 0);
}

export type MeterState = 'unlimited' | 'ok' | 'warning' | 'blocked';

export interface Meter {
  used: number;
  limit: number | null;
  percent: number;
  state: MeterState;
}

/** A quota bar: under 80 percent is fine, from 80 percent a warning, at 100 percent the limit is reached. */
export function meter(used: number, limit: number | null): Meter {
  if (limit === null) return { used, limit, percent: 0, state: 'unlimited' };
  if (limit === 0) return { used, limit, percent: 100, state: 'blocked' };
  const percent = toInt((used * 100) / limit, 0);
  const capped = percent > 100 ? 100 : percent;
  return {
    used,
    limit,
    percent: capped,
    state: used >= limit ? 'blocked' : percent >= 80 ? 'warning' : 'ok',
  };
}

const rank = (v: EntitlementValue | undefined): number =>
  v === null ? Number.POSITIVE_INFINITY : typeof v === 'number' ? v : -1;

export interface PlanLike {
  slug: string;
  name: string;
  sortOrder: number;
  status: 'active' | 'archived';
  entitlements: EntitlementMap;
}

/** The first active plan (by order) that gives more of a locked feature than the current one, for the upgrade prompt. */
export function upgradeTarget(
  plans: readonly PlanLike[],
  current: string,
  key: string,
): PlanLike | null {
  const sorted = [...plans]
    .filter((p) => p.status === 'active')
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const now = sorted.find((p) => p.slug === current)?.entitlements[key];
  for (const p of sorted) {
    if (p.slug === current) continue;
    const value = p.entitlements[key];
    if (keyKind(key) === 'switch') {
      if (hasValue(value) && !hasValue(now)) return p;
    } else if (rank(value) > rank(now)) {
      return p;
    }
  }
  return null;
}

export interface Impact {
  key: string;
  used: number;
  limit: number;
}

/** What a move to a plan leaves over its limits. Nothing is deleted or locked: only new work is refused until the use falls. */
export function downgradeImpact(
  used: Readonly<Record<string, number>>,
  next: EntitlementMap,
): Impact[] {
  const out: Impact[] = [];
  for (const [key, value] of Object.entries(next)) {
    if (typeof value !== 'number') continue;
    const have = used[key];
    if (have !== undefined && have > value) out.push({ key, used: have, limit: value });
  }
  return out;
}

export const METERED_KEYS: readonly EntitlementKey[] = [
  'invoices.monthly',
  'clients.max',
  'staff.seats',
  'storage.gigabytes',
  'emails.monthly',
  'api.requests_monthly',
];
export { ENTITLEMENT_KEYS };
