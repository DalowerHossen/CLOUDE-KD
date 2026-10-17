// path: services/invoice/write-off.ts
// Write-off: money that will not be collected. Only the owner can do it, with a written reason. The write-off settles
// that part of the invoice (like a payment, but recorded as a write-off), so the invoice closes when nothing is left,
// and reports can show bad debt apart from cash received.
import 'server-only';
import { getService } from '@/lib/container';
import { InternalError, ValidationError } from '@/lib/errors';
import { Money } from '@/lib/utils/currency';
import { getAdminSupabase } from '@/lib/supabase/admin';
import type { Actor } from '@/types/contracts';
import { logInvoiceEvent } from './events';
import { getInvoice } from './invoices';

export async function writeOffInvoice(
  actor: Actor,
  invoiceId: string,
  input: { amount: string; reason: string },
): Promise<{ status: string; balance: string }> {
  if (!actor.companyId) throw new ValidationError('A company is needed.');
  if (actor.role !== 'owner') throw new ValidationError('Only the owner can write off an invoice.');
  const companyId = actor.companyId;
  const before = await getInvoice(companyId, invoiceId);
  const { data, error } = await getAdminSupabase().rpc('kd_invoice_writeoff', {
    p_company: companyId,
    p_invoice: invoiceId,
    p_amount: Money.parse(input.amount).toDbString(),
    p_reason: input.reason,
    p_by: actor.userId,
  });
  if (error) {
    if (error.code === '22023')
      throw new ValidationError(
        error.message.includes('more than the balance')
          ? 'The amount is more than what is still unpaid.'
          : 'This invoice cannot be written off now.',
      );
    throw new InternalError(error);
  }
  const row = (
    data as { writeoff_id: string; invoice_status: string; balance: string }[] | null
  )?.[0];
  if (!row) throw new InternalError(new Error('Write-off result missing.'));
  const balance = Money.parseRounded(String(row.balance)).toDbString();
  await logInvoiceEvent(
    companyId,
    invoiceId,
    'written_off',
    `${Money.parse(input.amount).toDbString()} written off: ${input.reason}`.slice(0, 480),
    actor.userId,
    { writeOffId: row.writeoff_id },
  );
  await getService('events').publish({
    name: row.invoice_status === 'paid' ? 'invoice.paid' : 'invoice.partially_paid',
    companyId,
    payload: {
      invoiceId,
      number: before.number,
      paymentId: row.writeoff_id,
      amount: Money.parse(input.amount).toDbString(),
      balance,
      source: 'write_off',
    },
  });
  await getService('audit').record({
    action: 'invoice.written_off',
    resourceType: 'invoice',
    resourceId: invoiceId,
    companyId,
    metadata: { amount: input.amount, reason: input.reason, by: actor.userId },
  });
  return { status: row.invoice_status, balance };
}

export async function listWriteOffs(
  companyId: string,
  invoiceId: string,
): Promise<{ id: string; amount: string; reason: string; createdAt: string }[]> {
  const { data, error } = await getAdminSupabase()
    .from('invoice_writeoffs')
    .select('id, amount, reason, created_at')
    .eq('company_id', companyId)
    .eq('invoice_id', invoiceId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw new InternalError(error);
  return (data ?? []).map((r) => ({
    id: String(r.id),
    amount: Money.parseRounded(String(r.amount)).toDbString(),
    reason: String(r.reason),
    createdAt: String(r.created_at),
  }));
}
