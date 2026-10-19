// path: workers/s14/settle-payment.event.ts
// Settles a payment into the wallet when it is captured, takes a refund back when it is refunded, charges back a lost
// dispute, holds longer when a dispute opens, and makes the wallet and settles waiting payments when KYC is approved.
// Safe to run again for the same event: every posting has a key made from the payment, refund or dispute.
import { InternalError } from '@/lib/errors';
import { Money } from '@/lib/utils/currency';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { extendActiveHolds } from '@/services/mor/holds';
import { chargeBack, reverseForRefund, settlePayment, settlePending } from '@/services/mor/settle';
import type { EventHandlerDefinition } from '@/services/jobs/handler-types';
import { ensureWallet } from '@/services/wallet/wallet-service';

/** The amount of the dispute case (made by the dispute intake worker; it is the amount at stake). */
async function disputedAmount(companyId: string, paymentId: string, processorDisputeId: string | null): Promise<Money | null> {
  let q = getAdminSupabase()
    .from('disputes')
    .select('amount')
    .eq('company_id', companyId)
    .eq('payment_id', paymentId)
    .is('deleted_at', null);
  if (processorDisputeId) q = q.eq('processor_dispute_id', processorDisputeId);
  const { data, error } = await q.order('opened_at', { ascending: false }).limit(1);
  if (error) throw new InternalError(error);
  return data?.[0] ? Money.parseRounded(String(data[0].amount)) : null;
}

const text = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v : null);

export const eventHandler: EventHandlerDefinition = {
  id: 'mor.settle',
  events: ['payment.captured', 'payment.refunded', 'dispute.opened', 'dispute.lost', 'kyc.approved'],
  async handle(event) {
    if (!event.companyId) return;
    const paymentId = text(event.payload.paymentId);
    switch (event.name) {
      case 'payment.captured':
        if (paymentId) await settlePayment(paymentId);
        return;
      case 'payment.refunded': {
        const refundId = text(event.payload.refundId);
        const amount = text(event.payload.refundedAmount);
        if (paymentId && refundId && amount) await reverseForRefund(paymentId, refundId, Money.parse(amount));
        return;
      }
      case 'dispute.opened': {
        const disputeId = text(event.payload.disputeId) ?? event.id;
        await extendActiveHolds(event.companyId, `A dispute was opened (${disputeId.slice(0, 40)}).`);
        return;
      }
      case 'dispute.lost': {
        const disputeId = text(event.payload.disputeId) ?? event.id;
        if (!paymentId) return;
        const amount = await disputedAmount(event.companyId, paymentId, text(event.payload.disputeId));
        if (amount) await chargeBack(paymentId, disputeId, amount);
        return;
      }
      case 'kyc.approved':
        await ensureWallet(event.companyId);
        await settlePending(event.companyId);
        return;
      default:
        return;
    }
  },
};
