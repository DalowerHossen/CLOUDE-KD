// path: lib/payment/adapters/adyen/mapping.ts
// Pure mapping of Adyen session results, refund answers and refusal codes to the platform's transaction shape
// (docs/processors/adyen.md sections 5, 7 and 8).
import { buildTransaction, fromMinorUnits } from '@/lib/payment/adapters/base';
import type { Money } from '@/lib/utils/currency';
import type { CardIdentity, DeclineCategory, ProcessorTransaction } from '@/types/contracts';
import { list, obj, str, type Json } from './api';

const CODES: Readonly<Record<string, DeclineCategory>> = {
  '12': 'insufficient_funds',
  '8': 'invalid_number',
  '6': 'invalid_expiry',
  '24': 'invalid_cvv',
  '11': 'three_ds_failed',
  '38': 'three_ds_failed',
  '39': 'three_ds_failed',
  '42': 'three_ds_failed',
  '5': 'processor_fraud_signal',
  '14': 'processor_fraud_signal',
  '20': 'processor_fraud_signal',
  '22': 'processor_fraud_signal',
  '31': 'processor_fraud_signal',
  '2': 'do_not_honor',
  '3': 'do_not_honor',
  '10': 'do_not_honor',
  '23': 'do_not_honor',
  '25': 'do_not_honor',
  '27': 'do_not_honor',
  '28': 'do_not_honor',
  '29': 'do_not_honor',
  '46': 'do_not_honor',
  '4': 'processor_error',
  '9': 'processor_error',
  '21': 'processor_error',
  '40': 'processor_error',
};

export function mapAdyenDecline(raw: {
  code: string | null;
  message: string | null;
}): DeclineCategory {
  return (raw.code && CODES[raw.code.trim()]) || 'other';
}

/** Integer minor units (a number) to Money; null when it is not that. */
export function centsOf(value: unknown): Money | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
    ? fromMinorUnits(value)
    : null;
}

/** `bin|last4|expiry|brand` from the session result's additional data, when Adyen returned it. */
export function cardIdentity(result: Json, payment: Json | null): CardIdentity | null {
  const extra = obj(result.additionalData);
  const last4 = str(extra?.cardSummary);
  if (!extra || !last4) return null;
  const brand = str(obj(payment?.paymentMethod)?.brand) ?? '';
  return {
    type: 'fingerprint',
    value: `${str(extra.cardBin) ?? ''}|${last4}|${str(extra.expiryDate) ?? ''}|${brand}`,
  };
}

/** The authorised payment of a session result, or null. */
export function authorisedPayment(result: Json): Json | null {
  return list(result.payments).find((p) => str(p.resultCode) === 'Authorised') ?? null;
}

/** A refund request answer as a transaction: `received` means accepted, the outcome comes by webhook. */
export function fromRefundAnswer(body: Json, requested: Money): ProcessorTransaction {
  const reference = str(body.pspReference);
  if (str(body.status) === 'received' && reference)
    return buildTransaction({
      status: 'pending',
      amount: requested,
      processorTransactionId: reference,
      rawCode: 'received',
    });
  return failure(requested, str(body.errorCode));
}

/** A refused request as a failed step. */
export function failure(amount: Money, code: string | null): ProcessorTransaction {
  return buildTransaction({
    status: 'declined',
    amount,
    declineCategory: 'other',
    rawCode: code ?? 'REFUSED',
    message: 'Adyen could not process this request.',
  });
}
