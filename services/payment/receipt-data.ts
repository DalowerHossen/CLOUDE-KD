// path: services/payment/receipt-data.ts
// The facts a receipt shows (STEP 13 draws the PDF and the portal page from them). Only captured payments have one.
import 'server-only';
import { InternalError, NotFoundError, ValidationError } from '@/lib/errors';
import { PROCESSOR_BY_ID } from '@/config/processors';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { getRow, money } from './payment-store';

export interface ReceiptData {
  paymentId: string;
  /** Short reference printed on the receipt. */
  reference: string;
  paidAt: string;
  companyName: string;
  clientName: string;
  invoiceNumber: string;
  amount: string;
  surcharge: string;
  total: string;
  refunded: string;
  currency: 'USD';
  method: string;
  processorName: string;
  refunds: { amount: string; at: string }[];
}

export async function receiptData(companyId: string, paymentId: string): Promise<ReceiptData> {
  const row = await getRow(companyId, paymentId);
  if (!['captured', 'partially_refunded', 'refunded'].includes(row.status) || !row.captured_at) {
    throw new ValidationError('A receipt exists only for a payment that was received.');
  }
  const db = getAdminSupabase();
  const [company, invoice, client, refunds] = await Promise.all([
    db.from('companies').select('name').eq('id', companyId).maybeSingle(),
    db
      .from('invoices')
      .select('number')
      .eq('company_id', companyId)
      .eq('id', row.invoice_id)
      .maybeSingle(),
    row.client_id
      ? db
          .from('clients')
          .select('name')
          .eq('company_id', companyId)
          .eq('id', row.client_id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    db
      .from('refunds')
      .select('amount, created_at')
      .eq('company_id', companyId)
      .eq('payment_id', paymentId)
      .eq('status', 'succeeded')
      .is('deleted_at', null)
      .order('created_at', { ascending: true }),
  ]);
  for (const r of [company, invoice, client, refunds])
    if (r.error) throw new InternalError(r.error);
  if (!company.data || !invoice.data) throw new NotFoundError();
  return {
    paymentId: row.id,
    reference: row.id.replace(/-/g, '').slice(-8).toUpperCase(),
    paidAt: row.captured_at,
    companyName: String(company.data.name),
    clientName: client.data ? String(client.data.name) : '',
    invoiceNumber: String(invoice.data.number ?? ''),
    amount: money(row.amount).toDbString(),
    surcharge: money(row.surcharge_amount).toDbString(),
    total: money(row.captured_amount).toDbString(),
    refunded: money(row.refunded_amount).toDbString(),
    currency: 'USD',
    method: row.payment_method,
    processorName: row.processor_id ? PROCESSOR_BY_ID[row.processor_id].name : '',
    refunds: (refunds.data ?? []).map((r) => ({
      amount: money(r.amount).toDbString(),
      at: String(r.created_at),
    })),
  };
}
