// path: lib/payment/adapters/payproglobal/mapping.ts
// Pure mapping of PayPro Global order details and refund answers to the platform's transaction shape
// (docs/processors/payproglobal.md sections 5, 7 and 8).
import { cardFacts } from '@/lib/payment/card-facts';
import { buildTransaction } from '@/lib/payment/adapters/base';
import { Money } from '@/lib/utils/currency';
import type { CardIdentity, DeclineCategory, ProcessorTransaction } from '@/types/contracts';
import { list, obj, str, type Json } from './api';

/** No decline code list was read, so every refusal is `other`. */
export function mapPayproDecline(_raw: {
  code: string | null;
  message: string | null;
}): DeclineCategory {
  return 'other';
}

/** A JSON number with at most four decimals, read from its text so no float arithmetic is involved. */
export function moneyOf(value: unknown): Money | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return null;
  const text = String(value);
  return /^\d{1,12}(\.\d{1,4})?$/.test(text) ? Money.parse(text) : null;
}

/** A custom field by name, whether the answer keys it with or without the `x-` prefix, in any letter case. */
export function customField(order: Json, name: string): string | null {
  const wanted = name.toLowerCase();
  const normal = (key: string): string => key.toLowerCase().replace(/^x-/, '');
  const fields = order.customFields;
  if (Array.isArray(fields)) {
    for (const entry of list(fields)) {
      const key = str(entry.key) ?? str(entry.name) ?? '';
      if (normal(key) === wanted) return str(entry.value);
    }
    return null;
  }
  const map = obj(fields);
  if (!map) return null;
  for (const [key, value] of Object.entries(map)) if (normal(key) === wanted) return str(value);
  return null;
}

export function cardIdentity(order: Json): CardIdentity | null {
  const last4 = str(order.creditCardLast4);
  if (!last4) return null;
  return {
    type: 'fingerprint',
    value: `${str(order.paymentMethodName) ?? ''}|${last4}|${str(order.creditCardExpirationDate) ?? ''}`,
    ...cardFacts(last4, str(order.paymentMethodName)),
  };
}

/** Price without tax, and the tax; both in the billing currency. */
export function orderAmounts(order: Json): { price: Money | null; taxes: Money | null } {
  return { price: moneyOf(order.billingTotalPrice), taxes: moneyOf(order.billingTotalTaxes) };
}

/** Builds the transaction from order details. PayPro Global sells in one step, so a processed order is `captured`. */
export function fromOrder(order: Json, fallbackAmount: Money | null): ProcessorTransaction {
  const { price } = orderAmounts(order);
  const statusId = typeof order.orderStatusId === 'number' ? order.orderStatusId : 0;
  const reason = str(order.orderStatusReason);
  const common = {
    amount: price ?? fallbackAmount ?? Money.zero(),
    processorTransactionId: orderIdText(order.orderId),
    cardIdentity: cardIdentity(order),
    rawCode: String(statusId),
  };
  if (statusId === 5) return buildTransaction({ status: 'captured', ...common });
  if (statusId === 1) return buildTransaction({ status: 'pending', ...common });
  if (statusId === 3) return buildTransaction({ status: 'refunded', ...common });
  if (statusId === 2)
    return buildTransaction({
      status: 'declined',
      ...common,
      declineCategory: mapPayproDecline({ code: null, message: reason }),
      message: 'The order was canceled.',
    });
  return buildTransaction({
    status: 'error',
    ...common,
    declineCategory: 'other',
    rawCode: statusId === 4 ? 'CHARGEBACK' : String(statusId),
  });
}

function orderIdText(value: unknown): string | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0
    ? String(value)
    : null;
}

/** The first order item id, needed for a partial refund. */
export function firstItemId(order: Json): string | null {
  return orderIdText(list(order.orderItems)[0]?.orderItemId);
}

/** A refund answer as a transaction. */
export function fromRefund(
  entry: Json | null,
  requested: Money,
  orderId: string,
): ProcessorTransaction {
  if (entry && entry.isRefundSuccessful === true)
    return buildTransaction({
      status: 'refunded',
      amount: requested,
      processorTransactionId: orderId,
      rawCode: 'refunded',
    });
  return buildTransaction({
    status: 'declined',
    amount: requested,
    declineCategory: 'other',
    rawCode: 'REFUND_REFUSED',
    message: 'PayPro Global did not refund this order.',
  });
}

/** A refused request as a failed step. */
export function failure(amount: Money): ProcessorTransaction {
  return buildTransaction({
    status: 'declined',
    amount,
    declineCategory: 'other',
    rawCode: 'REFUSED',
    message: 'PayPro Global could not process this request.',
  });
}
