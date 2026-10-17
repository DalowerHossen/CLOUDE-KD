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
