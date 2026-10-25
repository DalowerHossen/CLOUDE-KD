// path: lib/payment/adapters/paddle/mapping.ts
// Pure mapping of Paddle transactions, adjustments and error codes to the platform's transaction shape
// (docs/processors/paddle.md sections 5, 7 and 8).
import { cardFacts } from '@/lib/payment/card-facts';
import { buildTransaction, fromMinorUnits } from '@/lib/payment/adapters/base';
import type { Money } from '@/lib/utils/currency';
import type { CardIdentity, DeclineCategory, ProcessorTransaction } from '@/types/contracts';
import { list, obj, str, type Json } from './api';

const CODES: Readonly<Record<string, DeclineCategory>> = {
  not_enough_balance: 'insufficient_funds',
  invalid_payment_details: 'invalid_number',
  expired_card: 'invalid_expiry',
  authentication_failed: 'three_ds_failed',
  fraud: 'processor_fraud_signal',
  blocked_card: 'processor_fraud_signal',
  declined: 'do_not_honor',
  declined_not_retryable: 'do_not_honor',
  transaction_not_permitted: 'do_not_honor',
  prepaid_card_not_supported: 'do_not_honor',
  preferred_network_not_supported: 'do_not_honor',
  issuer_unavailable: 'processor_error',
  psp_error: 'processor_error',
  system_error: 'processor_error',
};

export function mapPaddleDecline(raw: {
  code: string | null;
  message: string | null;
}): DeclineCategory {
  return (raw.code && CODES[raw.code]) || 'other';
}

/** Integer text of the lowest currency denomination (cents) to Money; null when it is not that. */
export function centsOf(value: unknown): Money | null {
  return typeof value === 'string' && /^\d{1,15}$/.test(value) ? fromMinorUnits(value) : null;
}

const PAID_STATES: ReadonlySet<string> = new Set(['paid', 'completed']);

/** The newest payment attempt of a transaction. */
export function latestAttempt(transaction: Json): Json | null {
  let best: Json | null = null;
  let bestTime = '';
  for (const attempt of list(transaction.payments)) {
    const time = str(attempt.created_at) ?? '';
    if (best === null || time >= bestTime) {
      best = attempt;
      bestTime = time;
    }
  }
  return best;
}

/** Card details of the captured attempt; there is no fingerprint, so the identity is last four, expiry and type. */
export function cardIdentity(attempt: Json | null): CardIdentity | null {
  const card = obj(obj(attempt?.method_details)?.card);
  const last4 = str(card?.last4);
  if (!card || !last4) return null;
  return {
    type: 'fingerprint',
    value: `${last4}|${String(card.expiry_month ?? '')}/${String(card.expiry_year ?? '')}|${str(card.type) ?? ''}`,
    ...cardFacts(last4, str(card.type)),
  };
}

/** The amount the payer owes, in cents: `details.totals.grand_total`. */
export function grandTotal(transaction: Json): Money | null {
  return centsOf(obj(obj(transaction.details)?.totals)?.grand_total);
}

/** First line item id (`txnitm_...`), needed for a partial refund. */
export function firstItemId(transaction: Json): string | null {
  return str(list(obj(transaction.details)?.line_items)[0]?.id);
}

/** Builds the transaction from a Paddle transaction. Paddle sells in one step, so a paid transaction is `captured`. */
export function fromTransaction(
  transaction: Json,
  fallbackAmount: Money | null,
): ProcessorTransaction {
  const amount = grandTotal(transaction) ?? fallbackAmount ?? fromMinorUnits(0);
  const attempt = latestAttempt(transaction);
  const status = str(transaction.status) ?? '';
  const common = {
    amount,
    processorTransactionId: str(transaction.id),
    cardIdentity: cardIdentity(attempt),
    rawCode: status === '' ? null : status,
  };
  if (PAID_STATES.has(status)) return buildTransaction({ status: 'captured', ...common });
  if (status === 'canceled') return buildTransaction({ status: 'voided', ...common });
  const attemptStatus = str(attempt?.status);
  const errorCode = str(attempt?.error_code);
  if (errorCode || attemptStatus === 'error') {
    return buildTransaction({
      status: 'declined',
      ...common,
      declineCategory: mapPaddleDecline({ code: errorCode, message: null }),
      rawCode: errorCode ?? attemptStatus,
    });
  }
  if (status === 'draft' || status === 'ready' || status === 'billed' || status === 'past_due')
    return buildTransaction({ status: 'pending', ...common });
  return buildTransaction({ status: 'error', ...common, declineCategory: 'processor_error' });
}

/** A refund (adjustment) as a transaction: approved = refunded, waiting for Paddle = pending, rejected = declined. */
export function fromAdjustment(adjustment: Json, requested: Money): ProcessorTransaction {
  const state = str(adjustment.status);
  const total = centsOf(obj(adjustment.totals)?.total) ?? requested;
  const base = { amount: total, processorTransactionId: str(adjustment.id), rawCode: state };
  if (state === 'approved') return buildTransaction({ status: 'refunded', ...base });
  if (state === 'pending_approval') return buildTransaction({ status: 'pending', ...base });
  return buildTransaction({
    status: 'declined',
    ...base,
    declineCategory: 'other',
    message: 'Paddle did not approve this refund.',
  });
}

/** A refused request (HTTP 4xx) as a failed step. */
export function failureFromError(code: string | null, amount: Money): ProcessorTransaction {
  return buildTransaction({
    status: 'declined',
    amount,
    declineCategory: mapPaddleDecline({ code, message: null }),
    rawCode: code,
    message: 'Paddle could not process this request.',
  });
}
