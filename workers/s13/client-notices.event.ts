// path: workers/s13/client-notices.event.ts
// Messages to the client that follow a payment event: the receipt (payment received), the thank-you (invoice paid in
// full) and the refund note. Safe to run again for the same event: each message has a key built from the payment, the
// invoice or the refund, so it goes out once.
import type { EventHandlerDefinition } from '@/services/jobs/handler-types';
import { sendReceiptNotice, sendRefundNotice, sendThankYou } from '@/services/portal/notices';
import type { DomainEventName } from '@/types/events';

const EVENTS: readonly DomainEventName[] = ['payment.captured', 'invoice.paid', 'payment.refunded'];

function text(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null;
}

export const eventHandler: EventHandlerDefinition = {
  id: 'portal.client-notices',
  events: EVENTS,
  async handle(event) {
    if (!event.companyId) return;
    const paymentId = text(event.payload.paymentId);
    if (event.name === 'payment.captured' && paymentId) {
      await sendReceiptNotice(event.companyId, paymentId);
    } else if (event.name === 'invoice.paid') {
      const invoiceId = text(event.payload.invoiceId);
      if (invoiceId) await sendThankYou(event.companyId, invoiceId);
    } else if (event.name === 'payment.refunded' && paymentId) {
      const refundId = text(event.payload.refundId);
      const amount = text(event.payload.refundedAmount);
      if (refundId && amount) await sendRefundNotice(event.companyId, paymentId, refundId, amount);
    }
  },
};
