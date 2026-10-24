// path: services/gateway/transfers.ts
// Payouts that the main merchant made to a sub-merchant, recorded here. The platform moves no money. Recording is one step in the
// database: one at a time per sub-merchant, never more than the available balance, never less than the minimum payout, and the same
// key gives the same payout. A recorded payout can be voided with a reason; it is never deleted.
import 'server-only';
import { ConflictError, InternalError, NotFoundError, ValidationError } from '@/lib/errors';
import { payoutInput, voidInput } from '@/lib/gateway/split-rules';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { Money } from '@/lib/utils/currency';
import type { Actor } from '@/types/contracts';
import { mapIntegrationError } from '@/services/publicapi/db-errors';
import { need, record } from './db';
import { getSubMerchant } from './sub-merchants';
import { termsFor } from './terms';

const COLUMNS =
  'id, sub_merchant_id, amount, reference, status, paid_at, void_reason, voided_at, created_at, version';

export interface PayoutView {
  id: string;
  subMerchantId: string;
  amount: string;
  reference: string;
  status: 'recorded' | 'void';
  paidAt: string;
  voidReason: string;
  voidedAt: string | null;
  version: number;
}

const toView = (r: Record<string, unknown>): PayoutView => ({
  id: String(r.id),
  subMerchantId: String(r.sub_merchant_id),
  amount: Money.parseRounded(String(r.amount)).toDbString(),
  reference: String(r.reference),
  status: r.status === 'void' ? 'void' : 'recorded',
  paidAt: String(r.paid_at),
  voidReason: String(r.void_reason),
  voidedAt: r.voided_at ? String(r.voided_at) : null,
  version: r.version as number,
});

export async function listPayouts(companyId: string, subMerchantId: string): Promise<PayoutView[]> {
  const { data, error } = await getAdminSupabase()
    .from('settlement_payouts')
    .select(COLUMNS)
    .eq('company_id', companyId)
    .eq('sub_merchant_id', subMerchantId)
    .is('deleted_at', null)
    .order('paid_at', { ascending: false })
    .limit(200);
  if (error) throw new InternalError(error);
  return (data ?? []).map(toView);
}

export async function recordPayout(actor: Actor, input: unknown): Promise<PayoutView> {
  const companyId = need(actor);
  const parsed = payoutInput.safeParse(input);
  if (!parsed.success)
    throw new ValidationError(parsed.error.issues[0]?.message ?? 'The payout is not valid.');
  const d = parsed.data;
  const sub = await getSubMerchant(companyId, d.subMerchantId);
  const terms = await termsFor(companyId, sub.id, new Date());
  const admin = getAdminSupabase();
  const { data: id, error } = await admin.rpc('kd_settlement_record_payout', {
    p_company: companyId,
    p_sub: sub.id,
    p_amount: Money.parse(d.amount).toDbString(),
    p_reference: d.reference,
    p_key: d.idempotencyKey,
    p_paid_at: new Date(d.paidAt).toISOString(),
    p_by: actor.userId,
    p_min: terms.minPayout,
  });
  if (error) {
    if (error.code === '22023') throw new ValidationError(error.message);
    if (error.code === '55000') throw new ConflictError(error.message);
    mapIntegrationError(error);
  }
  const { data, error: readError } = await admin
    .from('settlement_payouts')
    .select(COLUMNS)
    .eq('company_id', companyId)
    .eq('id', String(id))
    .single();
  if (readError) throw new InternalError(readError);
  const view = toView(data);
  await record(companyId, 'settlement.payout_recorded', 'settlement_payout', view.id, {
    subMerchantId: sub.id,
    amount: view.amount,
    reference: view.reference,
  });
  return view;
}

export async function voidPayout(actor: Actor, id: string, input: unknown): Promise<PayoutView> {
  const companyId = need(actor);
  const parsed = voidInput.safeParse(input);
  if (!parsed.success)
    throw new ValidationError(parsed.error.issues[0]?.message ?? 'The change is not valid.');
  const { data, error } = await getAdminSupabase()
    .from('settlement_payouts')
    .update({
      status: 'void',
      void_reason: parsed.data.reason,
      voided_at: new Date().toISOString(),
    })
    .eq('company_id', companyId)
    .eq('id', id)
    .eq('version', parsed.data.version)
    .eq('status', 'recorded')
    .is('deleted_at', null)
    .select(COLUMNS);
  if (error) mapIntegrationError(error);
  if (!data || data.length === 0) {
    const exists = await getAdminSupabase()
      .from('settlement_payouts')
      .select('id')
      .eq('company_id', companyId)
      .eq('id', id)
      .maybeSingle();
    throw exists.data
      ? new ConflictError('The payout changed or is already void. Reload and try again.')
      : new NotFoundError();
  }
  const view = toView(data[0] as Record<string, unknown>);
  await record(companyId, 'settlement.payout_voided', 'settlement_payout', id, {
    amount: view.amount,
    reason: parsed.data.reason,
  });
  return view;
}
