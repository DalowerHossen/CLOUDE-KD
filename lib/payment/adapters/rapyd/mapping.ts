// path: lib/payment/adapters/rapyd/mapping.ts
// Pure mapping of Rapyd payments, refunds and error codes to the platform's transaction shape
// (docs/processors/rapyd.md sections 5, 7 and 8).
import { buildTransaction } from '@/lib/payment/adapters/base';
import { Money } from '@/lib/utils/currency';
import type { CardIdentity, DeclineCategory, ProcessorTransaction } from '@/types/contracts';
import { obj, str, type Json } from './api';

/** Only the card codes shown in the sandbox documentation are mapped (docs section 8). */
const CARD_CODES: Readonly<Record<string, DeclineCategory>> = {
  '51': 'insufficient_funds',
  '05': 'do_not_honor',
  '43': 'processor_fraud_signal',
};

export function mapRapydDecline(raw: {
  code: string | null;
  message: string | null;
}): DeclineCategory {
  const match = /ERROR_PROCESSING_CARD - \[(\w+)\]/.exec(raw.code ?? '');
  return (match?.[1] && CARD_CODES[match[1]]) || 'other';
}

/** A JSON number with at most four decimals, read from its text so no float arithmetic is involved. */
export function moneyOf(value: unknown): Money | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return null;
  const text = String(value);
  return /^\d{1,12}(\.\d{1,4})?$/.test(text) ? Money.parse(text) : null;
}

export function cardIdentity(payment: Json): CardIdentity | null {
  const method = obj(payment.payment_method_data);
  if (!method || str(method.category) !== 'card') return null;
  const fingerprint = str(method.fingerprint_token);
  if (fingerprint) return { type: 'fingerprint', value: fingerprint };
  const last4 = str(method.last4);
  if (!last4) return null;
  const bin = obj(method.bin_details);
  return {
    type: 'fingerprint',
    value: `${str(bin?.bin_number) ?? ''}|${last4}|${str(method.expiration_month) ?? ''}/${str(method.expiration_year) ?? ''}|${str(bin?.brand) ?? ''}`,
  };
}

/** Builds the transaction from a Payment. A closed, paid, captured payment is `captured`. */
export function fromPayment(payment: Json, fallbackAmount: Money | null): ProcessorTransaction {
  const amount = moneyOf(payment.amount);
  const refunded = moneyOf(payment.refunded_amount);
  const status = str(payment.status) ?? '';
  const failureCode = str(payment.failure_code) ?? str(payment.error_code);
  const common = {
    amount: amount ?? fallbackAmount ?? Money.zero(),
    processorTransactionId: str(payment.id),
    cardIdentity: cardIdentity(payment),
    rawCode: failureCode ?? status,
  };
  if (status === 'CLO' && payment.paid === true && payment.captured === true) {
    if (amount && refunded && amount.gt(Money.zero()) && refunded.gte(amount))
      return buildTransaction({ status: 'refunded', ...common });
    return buildTransaction({ status: 'captured', ...common });
  }
  if (status === 'ACT') return buildTransaction({ status: 'pending', ...common });
  if (status === 'CAN' || status === 'REV')
    return buildTransaction({ status: 'voided', ...common });
  if (status === 'ERR' || status === 'EXP')
    return buildTransaction({
      status: 'declined',
      ...common,
      declineCategory: mapRapydDecline({
        code: failureCode,
        message: str(payment.failure_message),
      }),
      message: 'The payment was not completed.',
    });
  return buildTransaction({ status: 'error', ...common, declineCategory: 'processor_error' });
}

/** A refund as a transaction: Completed = refunded, Pending = pending, anything else = declined. */
export function fromRefund(refund: Json | null, requested: Money): ProcessorTransaction {
  const state = str(refund?.status);
  const base = {
    amount: moneyOf(refund?.amount) ?? requested,
    processorTransactionId: str(refund?.id),
    rawCode: state,
  };
  if (state === 'Completed') return buildTransaction({ status: 'refunded', ...base });
  if (state === 'Pending') return buildTransaction({ status: 'pending', ...base });
  return buildTransaction({
    status: 'declined',
    ...base,
    declineCategory: 'other',
    message: 'Rapyd did not complete this refund.',
  });
}

/** A refused request as a failed step. */
export function failure(amount: Money, errorCode: string | null): ProcessorTransaction {
  return buildTransaction({
    status: 'declined',
    amount,
    declineCategory: mapRapydDecline({ code: errorCode, message: null }),
    rawCode: errorCode,
    message: 'Rapyd could not process this request.',
  });
}
