// path: workers/s14/bnpl-refund.event.ts
// A refund on an invoice that has an installment plan is written to the history of the plan. Other invoices are ignored.
import type { EventHandlerDefinition } from '@/services/jobs/handler-types';
import { recordRefund } from '@/services/bnpl/installments';

export const eventHandler: EventHandlerDefinition = {
  id: 'bnpl.refund',
  events: ['payment.refunded'],
  async handle(event) {
    const invoiceId = typeof event.payload.invoiceId === 'string' ? event.payload.invoiceId : null;
    const amount =
      typeof event.payload.refundedAmount === 'string' ? event.payload.refundedAmount : '0.0000';
    if (!invoiceId) return;
    await recordRefund(invoiceId, amount);
  },
};
