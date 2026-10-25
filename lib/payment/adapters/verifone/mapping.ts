// path: lib/payment/adapters/verifone/mapping.ts
// Pure mapping of Verifone transactions and reason codes to the platform's transaction shape
// (docs/processors/verifone.md sections 6 to 8). Two vocabularies exist: the payment result of the Checkout events and
// of the payment actions (`status` AUTHORIZED, SETTLEMENT_REQUESTED, ...) and the stored transaction read back with
// `GET /api/v2/transaction/{id}` (`transaction_type` and `transaction_status`, AUTHORISED, SETTLED, ...).
import { cardFacts, lastFourOf } from '@/lib/payment/card-facts';
import { buildTransaction, fromMinorUnits } from '@/lib/payment/adapters/base';
import { Money } from '@/lib/utils/currency';
import type { CardIdentity, DeclineCategory, ProcessorTransaction } from '@/types/contracts';
import { obj, str, type Json } from './api';

const CODES: Readonly<Record<string, DeclineCategory>> = {
  // Funds
  '1016': 'insufficient_funds',
  // Card number
  '1011': 'invalid_number',
  '1018': 'invalid_number',
  '1820': 'invalid_number',
  // Expiry
  '1001': 'invalid_expiry',
  '2001': 'invalid_expiry',
  '1025': 'invalid_expiry',
  // Security code
  '1045': 'invalid_cvv',
  '1834': 'invalid_cvv',
  '9124': 'invalid_cvv',
  // Authentication asked for by the issuer
  '0800': 'three_ds_failed',
  '1813': 'three_ds_failed',
  '1815': 'three_ds_failed',
  '1816': 'three_ds_failed',
  '1824': 'three_ds_failed',
  '1836': 'three_ds_failed',
  '1838': 'three_ds_failed',
  // Fraud signals
  '1002': 'processor_fraud_signal',
  '1022': 'processor_fraud_signal',
  '1024': 'processor_fraud_signal',
  '1029': 'processor_fraud_signal',
  '1032': 'processor_fraud_signal',
  '1819': 'processor_fraud_signal',
  '2002': 'processor_fraud_signal',
  '2008': 'processor_fraud_signal',
  '2009': 'processor_fraud_signal',
  '2010': 'processor_fraud_signal',
  '9998': 'processor_fraud_signal',
  '111': 'processor_fraud_signal',
  // Issuer refusals
  '0085': 'do_not_honor',
  '1000': 'do_not_honor',
  '1003': 'do_not_honor',
  '1004': 'do_not_honor',
  '1005': 'do_not_honor',
  '1007': 'do_not_honor',
  '1008': 'do_not_honor',
  '1019': 'do_not_honor',
  '1021': 'do_not_honor',
  '1023': 'do_not_honor',
  '1035': 'do_not_honor',
  '1061': 'do_not_honor',
  '1826': 'do_not_honor',
  '1830': 'do_not_honor',
  '1832': 'do_not_honor',
  '1821': 'do_not_honor',
  '2000': 'do_not_honor',
  '2003': 'do_not_honor',
  '2004': 'do_not_honor',
  '2005': 'do_not_honor',
  '2007': 'do_not_honor',
  '2011': 'do_not_honor',
  '2012': 'do_not_honor',
  '121': 'do_not_honor',
  '123': 'do_not_honor',
  // Technical
  '100': 'processor_error',
  '170': 'processor_error',
  '5003': 'processor_error',
  '8001': 'processor_error',
  '8002': 'processor_error',
  '9106': 'processor_error',
  '9107': 'processor_error',
  '9109': 'processor_error',
  '9110': 'processor_error',
  '9111': 'processor_error',
  '9112': 'processor_error',
  '9123': 'processor_error',
  '9125': 'processor_error',
  '9200': 'processor_error',
  '9201': 'processor_error',
};

export function mapVerifoneDecline(raw: {
  code: string | null;
  message: string | null;
}): DeclineCategory {
  return (raw.code && CODES[raw.code]) || 'other';
}

/** Whole cents (integer) to Money; null when it is not a safe integer. */
export function centsOf(value: unknown): Money | null {
  return typeof value === 'number' && Number.isSafeInteger(value) ? fromMinorUnits(value) : null;
}

/** Decimal text such as "3.0" (the stored transaction) to Money; null when it is not a plain decimal. */
export function decimalOf(value: unknown): Money | null {
  const text = typeof value === 'number' ? String(value) : str(value);
  return text !== null && /^\d{1,14}(\.\d{1,4})?$/.test(text) ? Money.parse(text) : null;
}

/** Card identity from the token when Verifone returns one, else from the masked number (first 6, last 4) and brand. */
export function cardIdentity(
  token: string | null,
  masked: string | null,
  brand: string | null,
): CardIdentity | null {
  const facts = cardFacts(lastFourOf(masked), brand);
  if (token) return { type: 'token', value: token, ...facts };
  if (!masked) return null;
  const m = /^(\d{6})\D*(\d{4})$/.exec(masked.replace(/\s+/g, ''));
  return m ? { type: 'fingerprint', value: `${m[1]}|${m[2]}|${brand ?? ''}`, ...facts } : null;
}

function declined(
  amount: Money,
  id: string | null,
  reason: string | null,
  fallbackCode: string,
  message: string | null,
  identity: CardIdentity | null,
): ProcessorTransaction {
  return buildTransaction({
    status: 'declined',
    amount,
    processorTransactionId: id,
    declineCategory: mapVerifoneDecline({ code: reason, message: null }),
    rawCode: reason ?? fallbackCode,
    message,
    cardIdentity: identity,
  });
}

const CAPTURED: ReadonlySet<string> = new Set([
  'SETTLEMENT_REQUESTED',
  'SETTLEMENT_SUBMITTED',
  'SETTLEMENT_PARTIAL',
  'SETTLEMENT_COMPLETED',
]);
const VOIDED: ReadonlySet<string> = new Set([
  'AUTHORIZATION_VOIDED',
  'CANCELLED',
  'SETTLEMENT_CANCELLED',
]);
const WAITING: ReadonlySet<string> = new Set(['INITIATED', 'PENDING', 'CUSTOMER_ACCEPTED']);

/** Payment result of the Checkout events and of the payment actions. */
export function fromPayment(
  payment: Json,
  fallbackAmount: Money | null,
  identity: CardIdentity | null,
): ProcessorTransaction {
  const amount = centsOf(payment.amount) ?? fallbackAmount ?? fromMinorUnits(0);
  const id = str(payment.id);
  const status = str(payment.status) ?? '';
  const reason = str(payment.reason_code);
  const inner = obj(payment.details);
  const common = {
    amount,
    processorTransactionId: id,
    cardIdentity: identity,
    rawCode: reason ?? status,
  };
  if (status === 'AUTHORIZED') {
    return buildTransaction({
      status: inner?.auto_capture === true ? 'captured' : 'authorized',
      ...common,
    });
  }
  if (CAPTURED.has(status)) return buildTransaction({ status: 'captured', ...common });
  if (VOIDED.has(status)) return buildTransaction({ status: 'voided', ...common });
  if (status === 'REFUNDED') return buildTransaction({ status: 'refunded', ...common });
  if (WAITING.has(status)) return buildTransaction({ status: 'pending', ...common });
  if (status === 'DECLINED' || status === 'FAILED' || status === 'SETTLEMENT_DECLINED') {
    return declined(
      amount,
      id,
      reason,
      status,
      str(payment.status_reason) ? 'Verifone could not complete this payment.' : null,
      identity,
    );
  }
  return buildTransaction({
    status: 'error',
    ...common,
    declineCategory: 'processor_error',
    rawCode: status === '' ? null : status,
  });
}

const SALE_TYPES: ReadonlySet<string> = new Set([
  'SALE',
  'CAPTURE',
  'PREAUTH_COMPLETION',
  'DELAYED_CHARGE',
]);
const HELD_TYPES: ReadonlySet<string> = new Set(['AUTHORISATION', 'PREAUTH', 'REAUTHORISATION']);
const SETTLED_STATES: ReadonlySet<string> = new Set([
  'APPROVED',
  'CONFIRMED',
  'COMPLETED',
  'RECONCILED',
  'SETTLED',
  'SETTLEMENT_REQUESTED',
  'SUBMITTED',
]);
const OPEN_STATES: ReadonlySet<string> = new Set([
  'AUTHENTICATING',
  'DEFERRED',
  'INITIATED',
  'ON_HOLD',
  'RECEIVED',
  'REPEATING',
  'ROUTING',
  'SENT',
  'REVERSING',
]);
const REFUSED_STATES: ReadonlySet<string> = new Set([
  'DECLINED',
  'EXCEPTION',
  'EXPIRED',
  'FAILED',
  'REJECTED',
  'TIMED_OUT',
  'SETTLEMENT_FAILED',
]);

/** The stored transaction (`GET /api/v2/transaction/{id}`). */
export function fromStored(tx: Json, fallbackAmount: Money | null): ProcessorTransaction {
  const type = str(tx.transaction_type) ?? '';
  const state = str(tx.transaction_status) ?? '';
  const amount = decimalOf(tx.amount) ?? fallbackAmount ?? fromMinorUnits(0);
  const reason = str(tx.reason_code);
  const identity = cardIdentity(
    null,
    str(tx.masked_card_number),
    str(tx.card_brand) ?? str(tx.payment_product_type),
  );
  // An action on a payment (capture, void, refund) is reported under the payment it belongs to.
  const own = str(tx.id);
  const id =
    type === 'CAPTURE' || type === 'VOID' || type === 'CANCEL' || type === 'REFUND'
      ? (str(tx.parent_id) ?? own)
      : own;
  const common = {
    amount,
    processorTransactionId: id,
    cardIdentity: identity,
    rawCode: state === '' ? null : state,
  };
  if (REFUSED_STATES.has(state) || type === 'DECLINED') {
    return declined(amount, id, reason, state === '' ? 'DECLINED' : state, null, identity);
  }
  if (type === 'VOID' || type === 'CANCEL')
    return buildTransaction({ status: 'voided', ...common });
  if (type === 'REFUND' || state === 'REFUNDED') {
    return buildTransaction({ status: 'refunded', ...common });
  }
  if (OPEN_STATES.has(state)) return buildTransaction({ status: 'pending', ...common });
  if (state === 'AUTHORISED' || (HELD_TYPES.has(type) && SETTLED_STATES.has(state))) {
    return buildTransaction({ status: 'authorized', ...common });
  }
  if (SALE_TYPES.has(type) && SETTLED_STATES.has(state)) {
    return buildTransaction({ status: 'captured', ...common });
  }
  if (state === 'PARTIALLY_REFUNDED') return buildTransaction({ status: 'captured', ...common });
  if (state === 'CANCELLED') return buildTransaction({ status: 'voided', ...common });
  return buildTransaction({
    status: 'error',
    ...common,
    declineCategory: 'processor_error',
  });
}

/** A refused request (HTTP 4xx) as a failed step. */
export function failureFromError(
  errorCode: string | null,
  body: Json,
  amount: Money,
): ProcessorTransaction {
  const reason = str(body.reason_code) ?? errorCode;
  return buildTransaction({
    status: 'declined',
    amount,
    declineCategory: mapVerifoneDecline({ code: reason, message: null }),
    rawCode: reason,
    message: 'Verifone could not process this request.',
  });
}
