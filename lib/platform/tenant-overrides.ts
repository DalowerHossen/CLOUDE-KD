// path: lib/platform/tenant-overrides.ts
// Custom limits per company: input rules and the way an override lies over the values of the plan. Safe to import in the
// browser.
import { z } from 'zod';
import { ENTITLEMENT_KEYS, type EntitlementValue } from '@/config/plans';
import { entitlementValueSchema, keyKind, type EntitlementMap } from '@/lib/payment/plan-rules';

const reason = z
  .string()
  .trim()
  .min(10)
  .max(500)
  .refine((v) => !/[<>]/.test(v), { message: 'Angle brackets are not allowed.' });

const key = z.enum(ENTITLEMENT_KEYS);

export const tenantOverrideSchema = z.discriminatedUnion('action', [
  z
    .object({
      action: z.literal('set'),
      companyId: z.string().uuid(),
      key,
      value: entitlementValueSchema,
      reason,
      expiresAt: z.string().datetime({ offset: true }).nullable(),
    })
    .strict()
    .superRefine((v, ctx) => {
      if (keyKind(v.key) === 'switch' && typeof v.value !== 'boolean')
        ctx.addIssue({ code: 'custom', path: ['value'], message: 'This feature is on or off.' });
      if (keyKind(v.key) === 'limit' && typeof v.value === 'boolean')
        ctx.addIssue({
          code: 'custom',
          path: ['value'],
          message: 'This feature has a number limit, or no limit.',
        });
    }),
  z.object({ action: z.literal('clear'), companyId: z.string().uuid(), key }).strict(),
]);
export type TenantOverrideInput = z.infer<typeof tenantOverrideSchema>;

export interface OverrideRow {
  key: string;
  value: EntitlementValue;
  expiresAt: string | null;
}

/** The plan's values with every override that has not run out laid on top. The plan map is not changed. */
export function applyOverrides(
  base: EntitlementMap,
  rows: readonly OverrideRow[],
  now: Date = new Date(),
): EntitlementMap {
  const merged: EntitlementMap = { ...base };
  for (const row of rows) {
    if (row.expiresAt !== null && Date.parse(row.expiresAt) <= now.getTime()) continue;
    merged[row.key] = row.value;
  }
  return merged;
}
