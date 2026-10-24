// path: lib/payment/adapters/bluesnap/mapping.ts
// Pure mapping of BlueSnap transactions and errors to the platform's transaction shape
// (docs/processors/bluesnap.md sections 6 to 8). Everything read from BlueSnap is untrusted text.
import { buildTransaction, fromMinorUnits, NO_THREE_DS } from '@/lib/payment/adapters/base';
import { Money } from '@/lib/utils/currency';
import type {
  CardIdentity,
  DeclineCategory,
  ProcessorTransaction,
  ThreeDSResult,
} from '@/types/contracts';
import { obj, str, type BlueSnapError, type Json } from './api';

const NAMES: Readonly<Record<string, DeclineCategory>> = {
  INSUFFICIENT_FUNDS: 'insufficient_funds',
  INSUFFICENT_FUNDS: 'insufficient_funds',
  LIMIT_EXCEEDED: 'insufficient_funds',
  INVALID_CARD_NUMBER: 'invalid_number',
  INVALID_CARD_TYPE: 'invalid_number',
  TRANSACTION_CARD_NOT_VALID: 'invalid_number',
  EXPIRED_CARD: 'invalid_expiry',
  CVV_ERROR: 'invalid_cvv',
  THREE_D_SECURITY_AUTHENTICATION_REQUIRED: 'three_ds_failed',
  STRONG_CUSTOMER_AUTHENTICATION_REQUIRED: 'three_ds_failed',
  THREE_D_SECURE_FAILURE: 'three_ds_failed',
  CARD_LOST_OR_STOLEN: 'processor_fraud_signal',
  PICKUP_CARD: 'processor_fraud_signal',
  HIGH_RISK_ERROR: 'processor_fraud_signal',
  RESTRICTED_CARD: 'processor_fraud_signal',
  FRAUD_DETECTED: 'processor_fraud_signal',
  FRAUD_ERROR: 'processor_fraud_signal',
  DO_NOT_HONOR: 'do_not_honor',
  CALL_ISSUER: 'do_not_honor',
  PROCESSING_GENERAL_DECLINE: 'do_not_honor',
  INVALID_TRANSACTION: 'do_not_honor',
  ACCOUNT_CLOSED: 'do_not_honor',
  NEW_ACCOUNT_INFORMATION_AVAILABLE: 'do_not_honor',
  PROCESSING_TRANSACTION_NOT_AUTHORIZED: 'do_not_honor',
  GENERAL_PAYMENT_PROCESSING_ERROR: 'processor_error',
  PAYMENT_GENERAL_FAILURE: 'processor_error',
  BLS_CONNECTION_PROBLEM: 'processor_error',
  PROCESSING_TIMEOUT: 'processor_error',
  SYSTEM_TECHNICAL_ERROR: 'processor_error',
  THE_ISSUER_IS_UNAVAILABLE_OR_OFFLINE: 'processor_error',
  INCORRECT_SETUP: 'processor_error',
  REFUND_FAILED: 'processor_error',
};

/** `code` is the BlueSnap `errorName`. */
export function mapBluesnapDecline(raw: {
  code: string | null;
  message: string | null;
}): DeclineCategory {
  return (raw.code && NAMES[raw.code]) || 'other';
}

/** AVS result for the postal code: M match, N mismatch, anything else unknown. */
export function avsPostal(code: string | null): boolean | null {
  if (code === 'M') return true;
  if (code === 'N') return false;
  return null;
}

export function moneyFrom(value: unknown): Money | null {
  const text = typeof value === 'number' ? String(value) : str(value);
  return text && /^\d{1,13}(\.\d{1,4})?$/.test(text) ? Money.parse(text) : null;
}

/** `bin|last4|brand` when BlueSnap returns the BIN, otherwise no identity (docs section 7). */
export function cardIdentity(card: Json | null): CardIdentity | null {
  if (!card) return null;
  const bin = card.binNumber === undefined || card.binNumber === null ? '' : String(card.binNumber);
  const last4 =
    card.cardLastFourDigits === undefined || card.cardLastFourDigits === null
      ? ''
      : String(card.cardLastFourDigits);
  if (!/^\d{4,6}$/.test(bin) || !/^\d{4}$/.test(last4)) return null;
  return { type: 'fingerprint', value: `${bin}|${last4}|${str(card.cardType) ?? ''}` };
}

/** 3D Secure result from the transaction's `threeDSecure.authenticationResult` (docs section 6). */
export function readThreeDs(transaction: Json, requested: boolean): ThreeDSResult {
  const result = str(obj(transaction.threeDSecure)?.authenticationResult);
  if (!result) return { ...NO_THREE_DS, requested };
  return {
    requested,
    completed: result !== 'AUTHENTICATION_INCOMPLETE',
    authenticated: result === 'AUTHENTICATION_SUCCEEDED',
    liabilityShift: result === 'AUTHENTICATION_SUCCEEDED' ? true : false,
  };
}

/** A refused request (HTTP 400 and similar with a `message` list) as a failed payment step. */
export function failureFromErrors(
  errors: readonly BlueSnapError[],
  amount: Money,
): ProcessorTransaction {
  const first = errors[0] ?? null;
  return buildTransaction({
    status: 'declined',
    amount,
    declineCategory: mapBluesnapDecline({ code: first?.errorName ?? null, message: null }),
    rawCode: first?.errorName ?? null,
    message: first ? 'BlueSnap could not process this request.' : null,
  });
}

const TYPE_STATUS: Readonly<Record<string, ProcessorTransaction['status']>> = {
  AUTH_ONLY: 'authorized',
  AUTH_CAPTURE: 'captured',
  CAPTURE: 'captured',
  AUTH_REVERSAL: 'voided',
};

/** Builds the transaction from a BlueSnap `cardTransaction` object. */
export function fromTransaction(
  transaction: Json,
  requested: boolean,
  fallbackAmount: Money | null,
): ProcessorTransaction {
  const processing = obj(transaction.processingInfo);
  const card = obj(transaction.creditCard);
  const status = (str(processing?.processingStatus) ?? '').toUpperCase();
  const common = {
    amount: moneyFrom(transaction.amount) ?? fallbackAmount ?? fromMinorUnits(0),
    processorTransactionId:
      transaction.transactionId === undefined || transaction.transactionId === null
        ? null
        : String(transaction.transactionId),
    avsPostalCodeMatch: avsPostal(str(processing?.avsResponseCodeZip)),
    cardIdentity: cardIdentity(card),
    threeDS: readThreeDs(transaction, requested),
  };
  if (status === 'PENDING_MERCHANT_REVIEW')
    return buildTransaction({ status: 'pending', ...common, rawCode: status });
  const mapped = TYPE_STATUS[str(transaction.cardTransactionType) ?? ''];
  if (status === 'SUCCESS' && mapped)
    return buildTransaction({ status: mapped, ...common, rawCode: status });
  return buildTransaction({
    status: 'error',
    ...common,
    declineCategory: 'processor_error',
    rawCode: status || str(transaction.cardTransactionType),
  });
}
