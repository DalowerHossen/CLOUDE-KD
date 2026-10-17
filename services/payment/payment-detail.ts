// path: services/payment/payment-detail.ts
// Everything the payment detail page and the receipt need, for one payment of one company.
import 'server-only';
import { InternalError } from '@/lib/errors';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { getRow, money, toSummary } from './payment-store';
import type { PaymentSummary } from '@/types/contracts';

export interface PaymentDetail {
  payment: PaymentSummary;
  capturedAmount: string;
  refundedAmount: string;
  surchargeAmount: string;
  paymentMethod: string;
  environment: string | null;
  capturedAt: string | null;
  attempts: {
    action: string;
    outcome: string;
    declineCategory: string | null;
    createdAt: string;
  }[];
  refunds: {
    id: string;
    amount: string;
    status: string;
    reason: string | null;
    createdAt: string;
  }[];
}

export async function paymentDetail(companyId: string, paymentId: string): Promise<PaymentDetail> {
  const row = await getRow(companyId, paymentId);
  const db = getAdminSupabase();
  const [attempts, refunds] = await Promise.all([
    db
      .from('payment_attempts')
      .select('action, outcome, decline_category, created_at')
      .eq('company_id', companyId)
      .eq('payment_id', paymentId)
      .order('created_at', { ascending: true })
      .limit(100),
    db
      .from('refunds')
      .select('id, amount, status, reason, created_at')
      .eq('company_id', companyId)
      .eq('payment_id', paymentId)
      .is('deleted_at', null)
      .order('created_at', { ascending: true })
      .limit(100),
  ]);
  if (attempts.error) throw new InternalError(attempts.error);
  if (refunds.error) throw new InternalError(refunds.error);
  return {
    payment: toSummary(row),
    capturedAmount: money(row.captured_amount).toDbString(),
    refundedAmount: money(row.refunded_amount).toDbString(),
    surchargeAmount: money(row.surcharge_amount).toDbString(),
    paymentMethod: row.payment_method,
    environment: row.environment,
    capturedAt: row.captured_at,
    attempts: (attempts.data ?? []).map((a) => ({
      action: String(a.action),
      outcome: String(a.outcome),
      declineCategory: a.decline_category ? String(a.decline_category) : null,
      createdAt: String(a.created_at),
    })),
    refunds: (refunds.data ?? []).map((r) => ({
      id: String(r.id),
      amount: String(r.amount),
      status: String(r.status),
      reason: r.reason ? String(r.reason) : null,
      createdAt: String(r.created_at),
    })),
  };
}

export interface PaymentListItem {
  id: string;
  invoiceId: string;
  invoiceNumber: string;
  status: string;
  amount: string;
  processorId: string | null;
  createdAt: string;
}

export async function paymentListView(
  companyId: string,
  filter: { status?: string; limit: number },
): Promise<PaymentListItem[]> {
  const db = getAdminSupabase();
  let query = db
    .from('payments')
    .select('id, invoice_id, status, amount, processor_id, created_at')
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(filter.limit);
  if (filter.status) query = query.eq('status', filter.status);
  const { data, error } = await query;
  if (error) throw new InternalError(error);
  const rows = data ?? [];
  const ids = [...new Set(rows.map((r) => String(r.invoice_id)))];
  const numbers = new Map<string, string>();
  if (ids.length > 0) {
    const inv = await db
      .from('invoices')
      .select('id, number')
      .eq('company_id', companyId)
      .in('id', ids);
    if (inv.error) throw new InternalError(inv.error);
    for (const i of inv.data ?? []) numbers.set(String(i.id), String(i.number ?? ''));
  }
  return rows.map((r) => ({
    id: String(r.id),
    invoiceId: String(r.invoice_id),
    invoiceNumber: numbers.get(String(r.invoice_id)) ?? '',
    status: String(r.status),
    amount: String(r.amount),
    processorId: r.processor_id ? String(r.processor_id) : null,
    createdAt: String(r.created_at),
  }));
}

/** Open invoices that can receive a payment link, newest first. */
export async function payableInvoices(
  companyId: string,
): Promise<{ id: string; number: string; due: string }[]> {
  const { data, error } = await getAdminSupabase()
    .from('invoices')
    .select('id, number, amount_due, amount_paid')
    .eq('company_id', companyId)
    .in('status', ['sent', 'viewed', 'partially_paid', 'overdue'])
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) throw new InternalError(error);
  return (data ?? []).map((i) => ({
    id: String(i.id),
    number: String(i.number ?? ''),
    due: money(i.amount_due).sub(money(i.amount_paid)).toDbString(),
  }));
}
