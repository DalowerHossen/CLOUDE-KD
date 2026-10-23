// path: services/purchase/remittances.ts
// Money paid to suppliers ("remittances"): pay one or more open bills in one step, cancel a remittance.
// The database function checks every amount under a row lock; the idempotency key makes a repeat harmless.
import 'server-only';
import { getService } from '@/lib/container';
import { InternalError, ValidationError } from '@/lib/errors';
import type { RemittanceInput } from '@/lib/procurement/bills';
import { formatNumber } from '@/lib/stock/documents';
import { Money } from '@/lib/utils/currency';
import { getAdminSupabase } from '@/lib/supabase/admin';
import type { Actor } from '@/types/contracts';

export interface RemittanceView {
  id: string;
  number: string;
  amount: string;
  paidOn: string;
  method: string;
  reference: string;
  status: 'posted' | 'void';
  bills: { billId: string; billNumber: string; amount: string }[];
}

export async function createRemittance(
  actor: Actor,
  input: RemittanceInput,
  key: string,
): Promise<{ id: string; number: string; replayed: boolean }> {
  if (!actor.companyId) throw new ValidationError('A company is needed.');
  const companyId = actor.companyId;
  const admin = getAdminSupabase();
  const year = new Date().getUTCFullYear();
  const seq = await admin.rpc('kd_next_number', { p_company: companyId, p_key: `RM:${year}` });
  if (seq.error) throw new InternalError(seq.error);
  const number = formatNumber('RM', year, Math.trunc(Number(seq.data)));
  const { data, error } = await admin.rpc('kd_supplier_remit', {
    p_company: companyId,
    p_supplier: input.supplierId,
    p_amount: input.amount,
    p_paid_on: input.paidOn,
    p_method: input.method,
    p_reference: input.reference,
    p_key: key,
    p_allocations: input.allocations,
    p_by: actor.userId,
    p_number: number,
  });
  if (error) {
    if (error.code === '22023')
      throw new ValidationError(
        'The payment cannot be recorded: check that the bills are open, belong to this supplier and are not paid for more than they owe.',
      );
    throw new InternalError(error);
  }
  const result = (data ?? {}) as { id?: string; number?: string; replayed?: boolean };
  if (result.replayed !== true)
    await getService('audit').record({
      action: 'supplier_remittance.created',
      resourceType: 'supplier_remittance',
      resourceId: String(result.id ?? ''),
      companyId,
      metadata: { number, amount: input.amount, by: actor.userId },
    });
  return {
    id: String(result.id ?? ''),
    number: String(result.number ?? number),
    replayed: result.replayed === true,
  };
}

export async function voidRemittance(actor: Actor, id: string): Promise<void> {
  if (!actor.companyId) throw new ValidationError('A company is needed.');
  const { error } = await getAdminSupabase().rpc('kd_supplier_remit_void', {
    p_company: actor.companyId,
    p_remittance: id,
  });
  if (error) {
    if (error.code === '22023')
      throw new ValidationError('This remittance was not found or is already cancelled.');
    throw new InternalError(error);
  }
  await getService('audit').record({
    action: 'supplier_remittance.voided',
    resourceType: 'supplier_remittance',
    resourceId: id,
    companyId: actor.companyId,
    metadata: { by: actor.userId },
  });
}

export async function listRemittances(
  companyId: string,
  supplierId: string,
): Promise<RemittanceView[]> {
  const admin = getAdminSupabase();
  const { data, error } = await admin
    .from('supplier_remittances')
    .select('id, number, amount, paid_on, method, reference, status')
    .eq('company_id', companyId)
    .eq('supplier_id', supplierId)
    .is('deleted_at', null)
    .order('paid_on', { ascending: false })
    .order('id', { ascending: false })
    .limit(200);
  if (error) throw new InternalError(error);
  const ids = (data ?? []).map((r) => String(r.id));
  const al = ids.length
    ? await admin
        .from('supplier_remittance_allocations')
        .select('remittance_id, bill_id, amount')
        .eq('company_id', companyId)
        .in('remittance_id', ids)
        .is('deleted_at', null)
    : { data: [] as Record<string, unknown>[] };
  const bids = [...new Set((al.data ?? []).map((a) => String(a.bill_id)))];
  const b = bids.length
    ? await admin.from('supplier_bills').select('id, number').in('id', bids)
    : { data: [] as Record<string, unknown>[] };
  const bn = new Map((b.data ?? []).map((x) => [String(x.id), String(x.number)]));
  return (data ?? []).map((r) => ({
    id: String(r.id),
    number: String(r.number),
    amount: Money.parseRounded(String(r.amount)).toDbString(),
    paidOn: String(r.paid_on),
    method: String(r.method),
    reference: String(r.reference ?? ''),
    status: String(r.status) as 'posted' | 'void',
    bills: (al.data ?? [])
      .filter((a) => String(a.remittance_id) === String(r.id))
      .map((a) => ({
        billId: String(a.bill_id),
        billNumber: bn.get(String(a.bill_id)) ?? '',
        amount: Money.parseRounded(String(a.amount)).toDbString(),
      })),
  }));
}
