// path: services/payment/review-store.ts
// Creates the review queue row when the payment pipeline holds a payment (REQ-VERIFY item 2).
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
