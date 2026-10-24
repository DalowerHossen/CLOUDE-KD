// path: services/gateway/terms.ts
// The terms of settlement: commission, fixed fee, hold days and the minimum payout, per sub-merchant or as the company default. A
// change is a new version with its own start time; old versions stay, so an old entry can always be explained.
import 'server-only';
import { InternalError, NotFoundError, ValidationError } from '@/lib/errors';
import { termsInput, termsAt, NO_TERMS, type TermsLike } from '@/lib/gateway/split-rules';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { Money } from '@/lib/utils/currency';
import type { Actor } from '@/types/contracts';
import { mapIntegrationError } from '@/services/publicapi/db-errors';
import { need, record } from './db';
import { getSubMerchant } from './sub-merchants';

const COLUMNS =
  'id, sub_merchant_id, commission_percent, fixed_fee, hold_days, min_payout, effective_from, created_at';

export interface TermsView extends TermsLike {
  id: string;
  subMerchantId: string | null;
  effectiveFrom: string;
}

function toView(r: Record<string, unknown>): TermsView {
  return {
    id: String(r.id),
    subMerchantId: r.sub_merchant_id ? String(r.sub_merchant_id) : null,
    commissionPercent: Money.parseRounded(String(r.commission_percent)).toDbString(),
    fixedFee: Money.parseRounded(String(r.fixed_fee)).toDbString(),
    holdDays: r.hold_days === null ? 0 : (r.hold_days as number),
    minPayout: Money.parseRounded(String(r.min_payout)).toDbString(),
    effectiveFrom: String(r.effective_from),
  };
}

export async function listTerms(companyId: string): Promise<TermsView[]> {
  const { data, error } = await getAdminSupabase()
    .from('settlement_terms')
    .select(COLUMNS)
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .order('effective_from', { ascending: false })
    .limit(500);
  if (error) throw new InternalError(error);
  return (data ?? []).map(toView);
}

/** The terms in force for a sub-merchant at a time (the company default, or none). */
export async function termsFor(
  companyId: string,
  subMerchantId: string,
  at: Date,
): Promise<TermsLike> {
  const found = termsAt(await listTerms(companyId), subMerchantId, at);
  return found ?? NO_TERMS;
}

export async function setTerms(actor: Actor, input: unknown): Promise<TermsView> {
  const companyId = need(actor);
  const parsed = termsInput.safeParse(input);
  if (!parsed.success)
    throw new ValidationError(parsed.error.issues[0]?.message ?? 'The terms are not valid.');
  const d = parsed.data;
  if (d.subMerchantId !== null) await getSubMerchant(companyId, d.subMerchantId);
  const { data, error } = await getAdminSupabase()
    .from('settlement_terms')
    .insert({
      company_id: companyId,
      sub_merchant_id: d.subMerchantId,
      commission_percent: d.commissionPercent,
      fixed_fee: d.fixedFee,
      hold_days: d.holdDays,
      min_payout: d.minPayout,
      created_by: actor.userId,
    })
    .select(COLUMNS)
    .single();
  if (error) mapIntegrationError(error);
  const view = toView(data);
  await record(companyId, 'settlement.terms_set', 'settlement_terms', view.id, {
    subMerchantId: d.subMerchantId,
    commissionPercent: view.commissionPercent,
    fixedFee: view.fixedFee,
    holdDays: view.holdDays,
    minPayout: view.minPayout,
  });
  return view;
}

export async function deleteTerms(actor: Actor, id: string): Promise<void> {
  const companyId = need(actor);
  const { data, error } = await getAdminSupabase()
    .from('settlement_terms')
    .update({ deleted_at: new Date().toISOString() })
    .eq('company_id', companyId)
    .eq('id', id)
    .is('deleted_at', null)
    .select('id');
  if (error) mapIntegrationError(error);
  if (!data || data.length === 0) throw new NotFoundError();
  await record(companyId, 'settlement.terms_removed', 'settlement_terms', id, {});
}
