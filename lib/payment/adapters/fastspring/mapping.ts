// path: lib/payment/adapters/fastspring/mapping.ts
// Pure mapping of FastSpring orders and returns to the platform's transaction shape (docs/processors/fastspring.md
// sections 5, 7 and 8).
import { cardFacts } from '@/lib/payment/card-facts';
import { buildTransaction } from '@/lib/payment/adapters/base';
import { Money } from '@/lib/utils/currency';
import type { CardIdentity, DeclineCategory, ProcessorTransaction } from '@/types/contracts';
import { list, obj, str, type Json } from './api';

/** FastSpring gives no machine-readable decline code in the pages read, so every refusal is `other`. */
export function mapFastspringDecline(_raw: {
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

/** `brand|last4` of a card order; null for every other payment type. */
export function cardIdentity(order: Json): CardIdentity | null {
  const payment = obj(order.payment);
  if (!payment || str(payment.type) !== 'creditcard') return null;
  const last4 = str(payment.cardEnding);
  if (!last4) return null;
  return {
    type: 'fingerprint',
    value: `${str(payment.creditcard) ?? ''}|${last4}`,
    ...cardFacts(last4, str(payment.creditcard)),
  };
}

/** The amount the invoice is compared with: the pre-tax subtotal when present, else the total. */
export function orderAmounts(order: Json): { subtotal: Money | null; total: Money | null } {
  return { subtotal: moneyOf(order.subtotal), total: moneyOf(order.total) };
}

/** Builds the transaction from an order. FastSpring sells in one step, so a completed order is `captured`. */
export function fromOrder(order: Json, fallbackAmount: Money | null): ProcessorTransaction {
  const { subtotal, total } = orderAmounts(order);
  const common = {
    amount: subtotal ?? total ?? fallbackAmount ?? Money.zero(),
    processorTransactionId: str(order.id) ?? str(order.order),
    cardIdentity: cardIdentity(order),
    rawCode: order.completed === true ? 'completed' : 'not_completed',
  };
  if (order.completed === true) return buildTransaction({ status: 'captured', ...common });
  return buildTransaction({ status: 'pending', ...common });
}

/** The first entry of the `returns` list of a return answer. */
export function firstReturn(body: Json): Json | null {
  return list(body.returns)[0] ?? null;
}

/** A refund answer as a transaction: completed = refunded, accepted but not completed = pending, error = declined. */
export function fromReturn(entry: Json | null, requested: Money): ProcessorTransaction {
  if (!entry || str(entry.result) === 'error' || obj(entry.error)) return failure(requested);
  const id = str(entry.return);
  if (!id) return failure(requested);
  return buildTransaction({
    status: entry.completed === true ? 'refunded' : 'pending',
    amount: moneyOf(entry.totalReturn) ?? requested,
    processorTransactionId: id,
    rawCode: entry.completed === true ? 'completed' : 'accepted',
  });
}

/** A refused request as a failed step. */
export function failure(amount: Money): ProcessorTransaction {
  return buildTransaction({
    status: 'declined',
    amount,
    declineCategory: 'other',
    rawCode: 'REFUSED',
    message: 'FastSpring could not process this request.',
  });
}
