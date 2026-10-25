// path: lib/payment/adapters/square/mapping.ts
// Pure mapping of Square payments, refunds and errors to the platform's transaction shape
// (docs/processors/square.md sections 6 to 8).
import { cardFacts } from '@/lib/payment/card-facts';
import { buildTransaction, fromMinorUnits } from '@/lib/payment/adapters/base';
import type { Money } from '@/lib/utils/currency';
import type { CardIdentity, DeclineCategory, ProcessorTransaction } from '@/types/contracts';
import { list, obj, str, type Json, type SquareError } from './api';

const CODES: Readonly<Record<string, DeclineCategory>> = {
  INSUFFICIENT_FUNDS: 'insufficient_funds',
  INVALID_CARD: 'invalid_number',
  INVALID_ACCOUNT: 'invalid_number',
  INVALID_CARD_DATA: 'invalid_number',
  UNSUPPORTED_CARD_BRAND: 'invalid_number',
  CARD_EXPIRED: 'invalid_expiry',
  INVALID_EXPIRATION: 'invalid_expiry',
  INVALID_EXPIRATION_YEAR: 'invalid_expiry',
  INVALID_EXPIRATION_DATE: 'invalid_expiry',
  EXPIRATION_FAILURE: 'invalid_expiry',
  BAD_EXPIRATION: 'invalid_expiry',
  CVV_FAILURE: 'invalid_cvv',
  VERIFY_CVV_FAILURE: 'invalid_cvv',
  CARD_DECLINED_VERIFICATION_REQUIRED: 'three_ds_failed',
  CARD_DECLINED: 'do_not_honor',
  GENERIC_DECLINE: 'do_not_honor',
  CARD_DECLINED_CALL_ISSUER: 'do_not_honor',
  TRANSACTION_LIMIT: 'do_not_honor',
  CARDHOLDER_INSUFFICIENT_PERMISSIONS: 'do_not_honor',
  PAYMENT_LIMIT_EXCEEDED: 'do_not_honor',
  INTERNAL_SERVER_ERROR: 'processor_error',
  SERVICE_UNAVAILABLE: 'processor_error',
  GATEWAY_TIMEOUT: 'processor_error',
  BAD_GATEWAY: 'processor_error',
  REQUEST_TIMEOUT: 'processor_error',
  RATE_LIMITED: 'processor_error',
};

export function mapSquareDecline(raw: {
  code: string | null;
  message: string | null;
}): DeclineCategory {
  return (raw.code && CODES[raw.code]) || 'other';
}

/** AVS result for the postal code the payer typed in Square's own form. */
export function avsPostal(status: string | null): boolean | null {
  if (status === 'AVS_ACCEPTED') return true;
  if (status === 'AVS_REJECTED') return false;
  return null;
}

export function cardIdentity(card: Json | null): CardIdentity | null {
  if (!card) return null;
  const fingerprint = str(card.fingerprint);
  const last4 = str(card.last_4);
  if (fingerprint)
    return { type: 'fingerprint', value: fingerprint, ...cardFacts(last4, str(card.card_brand)) };
  if (!last4) return null;
  return {
    type: 'fingerprint',
    value: `${str(card.bin) ?? ''}|${last4}|${String(card.exp_month ?? '')}/${String(card.exp_year ?? '')}|${str(card.card_brand) ?? ''}`,
    ...cardFacts(last4, str(card.card_brand)),
  };
}

/** Money object ({ amount in cents, currency }) to Money; null when it is missing or not USD. */
export function moneyOf(value: unknown): Money | null {
  const m = obj(value);
  if (!m || m.currency !== 'USD' || typeof m.amount !== 'number' || !Number.isSafeInteger(m.amount))
    return null;
  return fromMinorUnits(m.amount);
}

/** A refused request (HTTP 4xx with an `errors` list) as a failed payment step. */
export function failureFromErrors(
  errors: readonly SquareError[],
  amount: Money,
): ProcessorTransaction {
  const preferred = errors.find((e) => e.category === 'PAYMENT_METHOD_ERROR') ?? errors[0] ?? null;
  return buildTransaction({
    status: 'declined',
    amount,
    declineCategory: mapSquareDecline({ code: preferred?.code ?? null, message: null }),
    rawCode: preferred?.code ?? null,
    message: preferred ? 'Square could not process this request.' : null,
  });
}

/** Builds the transaction from a Square Payment object. */
export function fromPayment(payment: Json, fallbackAmount: Money | null): ProcessorTransaction {
  const details = obj(payment.card_details);
  const card = obj(details?.card);
  const amount = moneyOf(payment.amount_money) ?? fallbackAmount ?? fromMinorUnits(0);
  const common = {
    amount,
    processorTransactionId: str(payment.id),
    avsPostalCodeMatch: avsPostal(str(details?.avs_status)),
    cardIdentity: cardIdentity(card),
  };
  const status = str(payment.status);
  if (status === 'APPROVED') return buildTransaction({ status: 'authorized', ...common });
  if (status === 'COMPLETED') {
    const refunded = moneyOf(payment.refunded_money);
    return buildTransaction({
      status: refunded && refunded.gte(amount) ? 'refunded' : 'captured',
      ...common,
    });
  }
  if (status === 'CANCELED') return buildTransaction({ status: 'voided', ...common });
  if (status === 'PENDING') return buildTransaction({ status: 'pending', ...common });
  if (status === 'FAILED') {
    const error = list(details?.errors)[0];
    const code = str(error?.code);
    return buildTransaction({
      status: 'declined',
      ...common,
      declineCategory: mapSquareDecline({ code, message: null }),
      rawCode: code ?? 'FAILED',
    });
  }
  return buildTransaction({
    status: 'error',
    ...common,
    declineCategory: 'processor_error',
    rawCode: status,
  });
}
