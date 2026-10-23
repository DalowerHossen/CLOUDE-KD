// path: services/payout/settings.ts
// The payout rules in force for a company: its own values, then the platform values, then the starting values of
// config/s14-payouts.ts. Only the super admin changes them (audited by the table trigger and an audit entry).
import 'server-only';
import { getService } from '@/lib/container';
import { ForbiddenError, InternalError, ValidationError } from '@/lib/errors';
import {
  BUILT_IN_PAYOUT_RULES,
  payoutSettingsInput,
  type PayoutRules,
  type PayoutSettingsInput,
} from '@/lib/payment/payout';
import { getAdminSupabase } from '@/lib/supabase/admin';
import type { Actor } from '@/types/contracts';

const COLUMNS =
  'id, min_amount, period_limit, period_unit, fee_fixed, fee_percent, fx_fee_percent, large_threshold';

interface Row {
  id: string;
  min_amount: string | number | null;
  period_limit: string | number | null;
  period_unit: PayoutRules['periodUnit'] | null;
  fee_fixed: string | number | null;
  fee_percent: string | number | null;
  fx_fee_percent: string | number | null;
  large_threshold: string | number | null;
}

async function rowFor(companyId: string | null): Promise<Row | null> {
  let q = getAdminSupabase().from('payout_settings').select(COLUMNS).is('deleted_at', null);
  q = companyId ? q.eq('company_id', companyId) : q.is('company_id', null);
  const { data, error } = await q.maybeSingle();
  if (error) throw new InternalError(error);
  return (data as Row | null) ?? null;
}

const text = (v: string | number | null | undefined): string | null =>
  v === null || v === undefined ? null : String(v);

export async function loadPayoutRules(companyId: string): Promise<PayoutRules> {
  const [own, platform] = await Promise.all([rowFor(companyId), rowFor(null)]);
  const b = BUILT_IN_PAYOUT_RULES;
  return {
    minAmount: text(own?.min_amount) ?? text(platform?.min_amount) ?? b.minAmount,
    periodLimit: text(own?.period_limit) ?? text(platform?.period_limit) ?? b.periodLimit,
    periodUnit: own?.period_unit ?? platform?.period_unit ?? b.periodUnit,
    feeFixed: text(own?.fee_fixed) ?? text(platform?.fee_fixed) ?? b.feeFixed,
    feePercent: text(own?.fee_percent) ?? text(platform?.fee_percent) ?? b.feePercent,
    fxFeePercent: text(own?.fx_fee_percent) ?? text(platform?.fx_fee_percent) ?? b.fxFeePercent,
    largeThreshold:
      text(own?.large_threshold) ?? text(platform?.large_threshold) ?? b.largeThreshold,
  };
}

const COLUMN_OF: Record<keyof PayoutSettingsInput, string> = {
  minAmount: 'min_amount',
  periodLimit: 'period_limit',
  periodUnit: 'period_unit',
  feeFixed: 'fee_fixed',
  feePercent: 'fee_percent',
  fxFeePercent: 'fx_fee_percent',
  largeThreshold: 'large_threshold',
};

/** Saves the platform values (`companyId` null) or the values of one company. Super admin only. */
export async function savePayoutSettings(
  actor: Actor,
  companyId: string | null,
  input: unknown,
): Promise<void> {
  if (actor.role !== 'super_admin') throw new ForbiddenError();
  const parsed = payoutSettingsInput.safeParse(input);
  if (!parsed.success)
    throw new ValidationError(parsed.error.issues[0]?.message ?? 'The settings are not valid.');
  const patch: Record<string, unknown> = { updated_by: actor.userId };
  for (const [key, value] of Object.entries(parsed.data)) {
    if (value !== undefined) patch[COLUMN_OF[key as keyof PayoutSettingsInput]] = value;
  }
  const current = await rowFor(companyId);
  const admin = getAdminSupabase();
  const written = current
    ? await admin.from('payout_settings').update(patch).eq('id', current.id)
    : await admin.from('payout_settings').insert({ ...patch, company_id: companyId });
  if (written.error) throw new InternalError(written.error);
  await getService('audit').record({
    action: 'payout.settings_saved',
    resourceType: 'payout_settings',
    resourceId: current?.id ?? null,
    companyId,
    metadata: { fields: Object.keys(parsed.data) },
  });
}
