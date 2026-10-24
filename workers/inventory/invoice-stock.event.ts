// path: workers/inventory/invoice-stock.event.ts
// Takes stock when an invoice is sent and gives it back when the invoice is voided. The invoice STEP puts the lines in
// the event payload: `{ invoiceId, lines: [{ productId, variantId?, quantity }] }`. An event without lines is ignored.
// The stock functions use the invoice id as idempotency key, so delivering the event again changes nothing.
import { z } from 'zod';
import { getService } from '@/lib/container';
import { createLogger } from '@/lib/logger';
import { moveLines } from '@/services/inventory/stock';
import type { EventHandlerDefinition } from '@/services/jobs/handler-types';

const log = createLogger({ component: 'inventory-invoice-stock' });
const payload = z
  .object({
    invoiceId: z.string().uuid(),
    lines: z
      .array(
        z.object({
          productId: z.string().uuid(),
          variantId: z.string().uuid().nullish(),
          quantity: z.string().regex(/^\d+(\.\d{1,4})?$/),
        }),
      )
      .max(200),
  })
  .passthrough();

export const eventHandler: EventHandlerDefinition = {
  id: 'inventory.invoice-stock',
  events: ['invoice.sent', 'invoice.voided'],
  async handle(event) {
    if (!event.companyId) return;
    const parsed = payload.safeParse(event.payload);
    if (!parsed.success || parsed.data.lines.length === 0) return;
    const sending = event.name === 'invoice.sent';
    try {
      await moveLines(event.companyId, {
        lines: parsed.data.lines.filter((l) => /[1-9]/.test(l.quantity)),
        direction: sending ? 'out' : 'in',
        kind: sending ? 'sale' : 'return_in',
        referenceType: 'invoice',
        referenceId: parsed.data.invoiceId,
        by: null,
        key: `invoice:${parsed.data.invoiceId}:${sending ? 'sent' : 'voided'}`,
      });
    } catch (error) {
      // Not enough stock must not block the invoice; the owner is told and the stock is corrected by hand.
      log.warn('stock could not be moved for an invoice', {
        invoiceId: parsed.data.invoiceId,
        event: event.name,
      });
      if (error instanceof Error && /Not enough stock/.test(error.message)) {
        await getService('notification')
          .notify({
            companyId: event.companyId,
            type: 'stock.short',
            title: 'Stock could not be taken for an invoice',
            body: 'There is not enough stock for one of the lines. Correct the stock by hand.',
            href: '/inventory',
          })
          .catch(() => undefined);
        return;
      }
      throw error;
    }
  },
};
