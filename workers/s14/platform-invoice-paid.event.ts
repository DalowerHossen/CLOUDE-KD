// path: workers/s14/platform-invoice-paid.event.ts
// When the operator company's invoice for a platform invoice is paid online (request R12), the platform invoice is paid
// too. An invoice that is not linked to a platform invoice is ignored. Safe to run again for the same event.
import type { EventHandlerDefinition } from '@/services/jobs/handler-types';
import { markPaidByOperator } from '@/services/subscription/platform';

export const eventHandler: EventHandlerDefinition = {
  id: 'subscription.invoice-paid',
  events: ['invoice.paid'],
  async handle(event) {
    const invoiceId = typeof event.payload.invoiceId === 'string' ? event.payload.invoiceId : null;
    if (!invoiceId) return;
    await markPaidByOperator(invoiceId, `online:${invoiceId}`);
  },
};
