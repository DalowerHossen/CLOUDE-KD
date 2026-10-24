// path: services/payment/register.ts
// Registers the `payments` contract (STEP 09, 13, 14, 15 and 16 call payments only through it).
import { getService, registerService } from '@/lib/container';
import { ForbiddenError } from '@/lib/errors';
import { type Money } from '@/lib/utils/currency';
import type { PaymentService } from '@/types/contracts';
import { getPayment, startPayment } from './payments';
import { refundPayment } from './refunds';
import { listReviewPayments } from './reviews';
import { toSummary, getRow } from './payment-store';

const payments: PaymentService = {
  createPayment: (input) => startPayment(input),
  refund: (paymentId, amount: Money, reason, idempotencyKey) =>
    refundPayment(paymentId, amount, reason, idempotencyKey),
  getPayment,
  async listReview() {
    const actor = await getService('auth').getActor();
    if (!actor) throw new ForbiddenError();
    const items = await listReviewPayments(actor.companyId);
    return Promise.all(items.map(async (i) => toSummary(await getRow(i.companyId, i.id))));
  },
};

export default async function register(): Promise<void> {
  registerService('payments', payments);
}
