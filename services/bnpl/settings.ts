// path: services/bnpl/settings.ts
// The installment rules in force for a company: its own values, then the platform values, then the starting values. The
// platform team switches the service on and sets the seller fee per number of parts; a company switches it on for itself
// and may narrow the parts and the amounts. The starting fee is 0 until the platform team sets a price.
import 'server-only';
import { getService } from '@/lib/container';
import { ForbiddenError, InternalError, ValidationError } from '@/lib/errors';
import {
  BUILT_IN_BNPL,
  bnplSettingsInput,
  type BnplRules,
  type BnplSettingsInput,
} from '@/lib/payment/bnpl-rules';
import { getAdminSupabase } from '@/lib/supabase/admin';
import type { Actor } from '@/types/contracts';

const COLUMNS =
  'id, enabled, terms, min_amount, max_amount, fee_percent_by_term, min_paid_invoices, missed_limit, grace_days';

interface Row {
  id: string;
  enabled: boolean | null;
  terms: number[] | null;
  min_amount: string | number | null;
  max_amount: string | number | null;
  fee_percent_by_term: Record<string, string> | null;
  min_paid_invoices: number | null;
  missed_limit: number | null;
  grace_days: number | null;
}

async function rowFor(companyId: string | null): Promise<Row | null> {
  let q = getAdminSupabase().from('bnpl_settings').select(COLUMNS).is('deleted_at', null);
  q = companyId ? q.eq('company_id', companyId) : q.is('company_id', null);
  const { data, error } = await q.maybeSingle();
  if (error) throw new InternalError(error);
  return (data as Row | null) ?? null;
}

const text = (v: string | number | null | undefined): string | null =>
  v === null || v === undefined ? null : String(v);

export async function loadBnplRules(companyId: string): Promise<BnplRules> {
  const [own, platform] = await Promise.all([rowFor(companyId), rowFor(null)]);
  const b = BUILT_IN_BNPL;
  const platformTerms = platform?.terms ?? b.terms;
  // A company can only narrow the platform's terms, never add one.
  const terms = own?.terms ? own.terms.filter((t) => platformTerms.includes(t)) : platformTerms;
  return {
    platformEnabled: platform?.enabled ?? b.platformEnabled,
    companyEnabled: own?.enabled ?? b.companyEnabled,
    terms: terms.length > 0 ? terms : platformTerms,
    minAmount: text(own?.min_amount) ?? text(platform?.min_amount) ?? b.minAmount,
    maxAmount: text(own?.max_amount) ?? text(platform?.max_amount) ?? b.maxAmount,
    feePercentByTerm: { ...b.feePercentByTerm, ...(platform?.fee_percent_by_term ?? {}) },
    minPaidInvoices: own?.min_paid_invoices ?? platform?.min_paid_invoices ?? b.minPaidInvoices,
    missedLimit: own?.missed_limit ?? platform?.missed_limit ?? b.missedLimit,
    graceDays: own?.grace_days ?? platform?.grace_days ?? b.graceDays,
    minInstallment: b.minInstallment,
  };
}

/**
 * Saves settings. The platform row (companyId null) and the fee per term are for the super admin; an owner saves the
 * company row (switch, terms, amounts, how many paid invoices a client needs, the late-part rules) but not the fee.
 */
export async function saveBnplSettings(
  actor: Actor,
  companyId: string | null,
  input: unknown,
): Promise<void> {
  const parsed = bnplSettingsInput.safeParse(input);
  if (!parsed.success)
    throw new ValidationError(parsed.error.issues[0]?.message ?? 'The settings are not valid.');
  const d = parsed.data;
  if (companyId === null || d.feePercentByTerm !== undefined) {
    if (actor.role !== 'super_admin') throw new ForbiddenError();
  } else if (
    actor.companyId !== companyId ||
    !(await getService('permissions').can(actor, 'client_subscription.manage', { type: 'bnpl' }))
  ) {
    throw new ForbiddenError();
  }
  const patch: Record<string, unknown> = { updated_by: actor.userId };
  if (d.enabled !== undefined) patch.enabled = d.enabled;
  if (d.terms !== undefined) patch.terms = d.terms;
  if (d.minAmount !== undefined) patch.min_amount = d.minAmount;
  if (d.maxAmount !== undefined) patch.max_amount = d.maxAmount;
  if (d.feePercentByTerm !== undefined) patch.fee_percent_by_term = d.feePercentByTerm;
  if (d.minPaidInvoices !== undefined) patch.min_paid_invoices = d.minPaidInvoices;
  if (d.missedLimit !== undefined) patch.missed_limit = d.missedLimit;
  if (d.graceDays !== undefined) patch.grace_days = d.graceDays;
  const current = await rowFor(companyId);
  const admin = getAdminSupabase();
  const written = current
    ? await admin.from('bnpl_settings').update(patch).eq('id', current.id)
    : await admin.from('bnpl_settings').insert({ ...patch, company_id: companyId });
  if (written.error) throw new InternalError(written.error);
  await getService('audit').record({
    action: 'bnpl.settings_saved',
    resourceType: 'bnpl_settings',
    resourceId: current?.id ?? null,
    companyId,
    metadata: { fields: Object.keys(d) },
  });
}

export type { BnplSettingsInput };
