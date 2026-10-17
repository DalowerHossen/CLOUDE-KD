// path: services/payment/payment-events.ts
// Domain events and audit entries of payments. The accounting STEP is fed by these events.
import { getService } from '@/lib/container';
import { logger } from '@/lib/logger';
import type { DomainEventName } from '@/types/contracts';
import { money, type PaymentRow } from './payment-store';

type PaymentEventName = Extract<DomainEventName, `payment.${string}`>;

export async function publishPaymentEvent(
  name: PaymentEventName,
  row: PaymentRow,
  extra: Record<string, unknown> = {},
): Promise<void> {
  try {
    await getService('events').publish({
      name,
      companyId: row.company_id,
      payload: {
        paymentId: row.id,
        invoiceId: row.invoice_id,
        processorId: row.processor_id,
        amount: money(row.amount).toDbString(),
        status: row.status,
        ...extra,
      },
    });
  } catch (error) {
    logger.error('payment event not published', { name, paymentId: row.id, error: String(error) });
  }
}

export async function auditPayment(
  action: string,
  row: PaymentRow,
  metadata: Record<string, unknown> = {},
): Promise<void> {
  await getService('audit').record({
    action,
    resourceType: 'payment',
    resourceId: row.id,
    companyId: row.company_id,
    metadata: { invoiceId: row.invoice_id, processorId: row.processor_id, ...metadata },
  });
}
