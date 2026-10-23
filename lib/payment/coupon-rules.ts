// path: lib/payment/coupon-rules.ts
// The rules of coupons as pure functions: the shape of a coupon, the code, the discount on an amount, the checks a
// coupon must pass, and the plain words for each way it can be refused. The database function `kd_coupon_redeem` makes
// the same checks under a lock, so these are used to explain a coupon before it is used and to test the rules.
import { randomInt } from 'node:crypto';
import { z } from 'zod';
import { Money } from '@/lib/utils/currency';

export const COUPON_KINDS = ['percent', 'fixed', 'free_trial'] as const;
export type CouponKind = (typeof COUPON_KINDS)[number];

/** Letters and digits without the ones that are easy to mix up (0 and O, 1 and I). */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function normalizeCode(code: string): string {
  return code.trim().toUpperCase();
}

export const codeSchema = z
  .string()
  .transform(normalizeCode)
  .pipe(z.string().regex(/^[A-Z0-9][A-Z0-9-]{2,31}$/, 'Use 3 to 32 letters, digits or dashes.'));

/** A random code such as KD-7H3QX9PM. */
export function generateCode(prefix = 'KD'): string {
  let out = '';
  // randomInt draws every position with equal probability (no bias from a remainder).
  for (let i = 0; i < 8; i += 1) out += ALPHABET[randomInt(ALPHABET.length)];
  return `${prefix}-${out}`;
}

const moneyText = z.string().regex(/^\d{1,12}(\.\d{1,4})?$/, 'Enter an amount like 10 or 10.50.');
const when = z.string().datetime({ offset: true });

export const couponInput = z
  .object({
    code: codeSchema.optional(),
    name: z
      .string()
      .trim()
      .min(1)
      .max(100)
      .refine((v) => !/[<>]/.test(v), { message: 'Angle brackets are not allowed.' }),
    kind: z.enum(COUPON_KINDS),
    percentOff: z
      .string()
      .regex(/^\d{1,3}(\.\d{1,4})?$/, 'Enter a percent like 20 or 12.5.')
      .optional(),
    amountOff: moneyText.optional(),
    trialDays: z.number().int().min(1).max(365).optional(),
    cycles: z.number().int().min(1).max(36).default(1),
    planSlugs: z
      .array(z.string().regex(/^[a-z][a-z0-9_]{1,30}$/))
      .max(20)
      .default([]),
    startsAt: when.nullable().default(null),
    expiresAt: when.nullable().default(null),
    maxRedemptions: z.number().int().min(1).max(1_000_000).nullable().default(null),
    oncePerCompany: z.boolean().default(true),
    enabled: z.boolean().default(true),
  })
  .strict()
  .superRefine((v, ctx) => {
    const need = (ok: boolean, path: string, message: string): void => {
      if (!ok) ctx.addIssue({ code: 'custom', path: [path], message });
    };
    need(
      v.kind !== 'percent' ||
        (v.percentOff !== undefined &&
          Money.parse(v.percentOff).isPositive() &&
          Money.parse(v.percentOff).lte('100')),
      'percentOff',
      'A percent coupon needs a percent above 0 and up to 100.',
    );
    need(
      v.kind !== 'fixed' || (v.amountOff !== undefined && Money.parse(v.amountOff).isPositive()),
      'amountOff',
      'A fixed coupon needs an amount above 0.',
    );
    need(
      v.kind !== 'free_trial' || v.trialDays !== undefined,
      'trialDays',
      'A free trial coupon needs the extra trial days.',
    );
    need(
      v.kind === 'percent' || v.percentOff === undefined,
      'percentOff',
      'Only a percent coupon has a percent.',
    );
    need(
      v.kind === 'fixed' || v.amountOff === undefined,
      'amountOff',
      'Only a fixed coupon has an amount.',
    );
    need(
      v.kind === 'free_trial' || v.trialDays === undefined,
      'trialDays',
      'Only a free trial coupon has trial days.',
    );
    need(
      !v.startsAt || !v.expiresAt || Date.parse(v.expiresAt) > Date.parse(v.startsAt),
      'expiresAt',
      'The end must be after the start.',
    );
  });
export type CouponInput = z.infer<typeof couponInput>;

/** What can be changed after a coupon exists (the code, the kind and the value never change). */
export const couponUpdateInput = z
  .object({
    name: z
      .string()
      .trim()
      .min(1)
      .max(100)
      .refine((v) => !/[<>]/.test(v), { message: 'Angle brackets are not allowed.' })
      .optional(),
    planSlugs: z
      .array(z.string().regex(/^[a-z][a-z0-9_]{1,30}$/))
      .max(20)
      .optional(),
    startsAt: when.nullable().optional(),
    expiresAt: when.nullable().optional(),
    maxRedemptions: z.number().int().min(1).max(1_000_000).nullable().optional(),
    enabled: z.boolean().optional(),
  })
  .strict();

export interface CouponFacts {
  kind: CouponKind;
  percentOff: string | null;
  amountOff: string | null;
  enabled: boolean;
  startsAt: string | null;
  expiresAt: string | null;
  planSlugs: readonly string[];
  maxRedemptions: number | null;
  oncePerCompany: boolean;
}

/** The discount on an amount (never more than the amount). A free trial coupon takes nothing off; it adds trial days. */
export function discountFor(
  coupon: Pick<CouponFacts, 'kind' | 'percentOff' | 'amountOff'>,
  amount: Money,
): Money {
  if (!amount.isPositive()) return Money.zero();
  let off = Money.zero();
  if (coupon.kind === 'percent' && coupon.percentOff) off = amount.percent(coupon.percentOff);
  if (coupon.kind === 'fixed' && coupon.amountOff) off = Money.parse(coupon.amountOff);
  return off.gt(amount) ? amount : off;
}

export type CouponError =
  'invalid' | 'disabled' | 'not_started' | 'expired' | 'wrong_plan' | 'used_up' | 'already_used';

/** The first reason a coupon cannot be used now, in the same order as the database function; null when it can be used. */
export function couponProblem(
  coupon: CouponFacts,
  context: { now: Date; planSlug: string; redemptions: number; usedByCompany: boolean },
): CouponError | null {
  if (!coupon.enabled) return 'disabled';
  if (coupon.startsAt && Date.parse(coupon.startsAt) > context.now.getTime()) return 'not_started';
  if (coupon.expiresAt && Date.parse(coupon.expiresAt) <= context.now.getTime()) return 'expired';
  if (coupon.planSlugs.length > 0 && !coupon.planSlugs.includes(context.planSlug))
    return 'wrong_plan';
  if (coupon.oncePerCompany && context.usedByCompany) return 'already_used';
  if (coupon.maxRedemptions !== null && context.redemptions >= coupon.maxRedemptions)
    return 'used_up';
  return null;
}

export const COUPON_MESSAGES: Record<CouponError, string> = {
  invalid: 'This code is not valid.',
  disabled: 'This code is switched off.',
  not_started: 'This code cannot be used yet.',
  expired: 'This code has expired.',
  wrong_plan: 'This code does not work with the plan you chose.',
  used_up: 'This code has been used the most times it allows.',
  already_used: 'Your company already used this code.',
};

/** After this many wrong codes in an hour a company is asked to wait. */
export const MAX_FAILED_ATTEMPTS_PER_HOUR = 10;
