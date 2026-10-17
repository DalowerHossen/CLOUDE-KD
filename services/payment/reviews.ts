// path: services/payment/reviews.ts
// Review queue rows (REQ-VERIFY item 2). Created by the payment pipeline when a payment cannot be captured yet.
import { InternalError } from '@/lib/errors';
import { reviewHoldUntil, type ReviewReason } from '@/lib/payment/verification';
import { getAdminSupabase } from '@/lib/supabase/admin';
import type { PaymentRow } from './payment-store';

export async function createReview(
  row: PaymentRow,
  reasons: ReviewReason[],
  now: Date,
): Promise<Date> {
  const holdUntil = reviewHoldUntil(row.processor_id ?? 'custom', now);
  const { error } = await getAdminSupabase().from('payment_reviews').upsert(
    {
      company_id: row.company_id,
      payment_id: row.id,
      reasons,
      status: 'pending',
      hold_until: holdUntil.toISOString(),
    },
    { onConflict: 'payment_id', ignoreDuplicates: true },
  );
  if (error) throw new InternalError(error);
  return holdUntil;
}

export interface ReviewPaymentListItem {
  id: string;
  invoiceId: string;
  companyId: string;
  amount: string;
  createdAt: string;
}

/** Payments waiting for a manual review. A company sees its own; platform roles see all. */
export async function listReviewPayments(
  companyId: string | null,
): Promise<ReviewPaymentListItem[]> {
  let query = getAdminSupabase()
    .from('payments')
    .select('id, invoice_id, company_id, amount, created_at')
    .eq('status', 'pending_review')
    .is('deleted_at', null)
    .order('created_at', { ascending: true })
    .limit(200);
  if (companyId) query = query.eq('company_id', companyId);
  const { data, error } = await query;
  if (error) throw new InternalError(error);
  return (data ?? []).map((r) => ({
    id: String(r.id),
    invoiceId: String(r.invoice_id),
    companyId: String(r.company_id),
    amount: String(r.amount),
    createdAt: String(r.created_at),
  }));
}
