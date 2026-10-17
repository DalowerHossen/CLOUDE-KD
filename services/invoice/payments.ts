// path: services/invoice/payments.ts
// What the payment STEP and the client pages need from an invoice: its amount due, applying a payment (once), marking
// a dispute, the "viewed" mark, and the daily overdue sweep. The payment STEP reaches this through the `invoices`
// contract (services/invoice/register.ts).
import 'server-only';
import { getService, tryGetService } from '@/lib/container';
import { InternalError, NotFoundError, ValidationError } from '@/lib/errors';
import { toInt } from '@/lib/reports/numbers';
import { canTransition } from '@/lib/invoice/status';
import { Money } from '@/lib/utils/currency';
import { getAdminSupabase } from '@/lib/supabase/admin';
import type { InvoiceForPayment, InvoiceStatus } from '@/types/contracts';
import { logInvoiceEvent } from './events';

type Row = Record<string, unknown>;

/** When the call runs for a signed-in company, an invoice of another company is "not found". */
async function assertTenant(companyId: string): Promise<void> {
  const tenant = tryGetService('tenant');
  if (!tenant) return;
  const ctx = await tenant.getTenantContext().catch(() => null);
  if (ctx && ctx.companyId !== companyId) throw new NotFoundError();
}

async function load(invoiceId: string): Promise<Row> {
  const { data, error } = await getAdminSupabase()
    .from('invoices')
    .select(
      'id, company_id, client_id, number, status, amount_due, amount_paid, bill_to, version, kind, total',
    )
    .eq('id', invoiceId)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw new InternalError(error);
  if (!data) throw new NotFoundError();
  await assertTenant(String(data.company_id));
  return data as unknown as Row;
}

export async function getForPayment(invoiceId: string): Promise<InvoiceForPayment> {
  const r = await load(invoiceId);
  const billTo = (r.bill_to ?? {}) as { postalCode?: string; country?: string | null };
  const status = String(r.status) as InvoiceStatus;
  const due =
    status === 'void' || status === 'draft' || status === 'pending_approval'
      ? Money.zero()
      : Money.parseRounded(String(r.amount_due)).sub(Money.parseRounded(String(r.amount_paid)));
  return {
    invoiceId,
    companyId: String(r.company_id),
    clientId: String(r.client_id ?? ''),
    invoiceNumber: String(r.number ?? ''),
    status,
    amountDue: due,
    currency: 'USD',
    billingPostalCode: billTo.postalCode ? billTo.postalCode : null,
    billingCountry: billTo.country ? billTo.country : null,
    version: toInt(r.version, 1),
  };
}

export async function applyPayment(input: {
  invoiceId: string;
  paymentId: string;
  amount: Money;
}): Promise<{ status: InvoiceStatus }> {
  const before = await load(input.invoiceId);
  const { data, error } = await getAdminSupabase().rpc('kd_invoice_apply_payment', {
    p_invoice: input.invoiceId,
    p_payment: input.paymentId,
    p_amount: input.amount.toDbString(),
  });
  if (error) {
    if (error.code === '22023')
      throw new ValidationError(
        'The payment cannot be applied: the invoice is not open for payment or the amount is more than the balance.',
      );
    throw new InternalError(error);
  }
  const row = (
    data as
      | {
          company_id: string;
          status: string;
          amount_paid: string;
          balance: string;
          replayed: boolean;
        }[]
      | null
  )?.[0];
  if (!row) throw new InternalError(new Error('Payment result missing.'));
  if (!row.replayed) {
    const companyId = String(before.company_id);
    await logInvoiceEvent(
      companyId,
      input.invoiceId,
      'payment_applied',
      `Payment of ${input.amount.toDbString()} applied`,
      null,
      { paymentId: input.paymentId },
    );
    await getService('events').publish({
      name: row.status === 'paid' ? 'invoice.paid' : 'invoice.partially_paid',
      companyId,
      payload: {
        invoiceId: input.invoiceId,
        number: before.number ? String(before.number) : null,
        paymentId: input.paymentId,
        amount: input.amount.toDbString(),
        balance: Money.parseRounded(String(row.balance)).toDbString(),
      },
    });
  }
  return { status: row.status as InvoiceStatus };
}

export async function markDisputed(invoiceId: string): Promise<void> {
  const r = await load(invoiceId);
  const status = String(r.status) as InvoiceStatus;
  if (status === 'disputed') return;
  if (!canTransition(status, 'disputed'))
    throw new ValidationError('This invoice cannot be disputed now.');
  const upd = await getAdminSupabase()
    .from('invoices')
    .update({ status: 'disputed', disputed_at: new Date().toISOString() })
    .eq('id', invoiceId)
    .eq('company_id', String(r.company_id))
    .eq('status', status)
    .select('id');
  if (upd.error) throw new InternalError(upd.error);
  await logInvoiceEvent(
    String(r.company_id),
    invoiceId,
    'disputed',
    'The payment was disputed',
    null,
  );
}

/** Called by the client page when the client opens the invoice: sent becomes viewed (once). */
export async function recordInvoiceViewed(invoiceId: string): Promise<void> {
  const r = await load(invoiceId);
  if (String(r.status) !== 'sent') return;
  const companyId = String(r.company_id);
  const upd = await getAdminSupabase()
    .from('invoices')
    .update({ status: 'viewed', viewed_at: new Date().toISOString() })
    .eq('id', invoiceId)
    .eq('company_id', companyId)
    .eq('status', 'sent')
    .select('id');
  if (upd.error) throw new InternalError(upd.error);
  if (upd.data && upd.data.length > 0) {
    await logInvoiceEvent(companyId, invoiceId, 'viewed', 'The client opened the invoice', null);
    await getService('events').publish({
      name: 'invoice.viewed',
      companyId,
      payload: { invoiceId, number: r.number ? String(r.number) : null },
    });
  }
}

/** Job: invoices past their due date become overdue and `invoice.overdue` is published for each. */
export async function sweepOverdue(): Promise<number> {
  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await getAdminSupabase().rpc('kd_invoice_mark_overdue', {
    p_today: today,
  });
  if (error) throw new InternalError(error);
  const rows = (data ?? []) as { id: string; company_id: string }[];
  for (const row of rows) {
    await logInvoiceEvent(
      row.company_id,
      row.id,
      'overdue',
      'The invoice is past its due date',
      null,
    );
    await getService('events').publish({
      name: 'invoice.overdue',
      companyId: row.company_id,
      payload: { invoiceId: row.id },
    });
  }
  return rows.length;
}
