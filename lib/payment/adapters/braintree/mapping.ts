// path: lib/payment/adapters/braintree/mapping.ts
// Pure mapping of Braintree GraphQL transactions to the platform's transaction shape (docs/processors/braintree.md
// sections 6 to 8). Everything read from Braintree is untrusted text (the API returns data unencoded).
import { buildTransaction, NO_THREE_DS } from '@/lib/payment/adapters/base';
import { Money } from '@/lib/utils/currency';
import type {
  CardIdentity,
  DeclineCategory,
  ProcessorTransaction,
  ProcessorTransactionStatus,
  ThreeDSResult,
} from '@/types/contracts';
import { list, obj, str, type Json } from './api';

const RESPONSE = 'processorResponse { legacyCode message avsPostalCodeResponse cvvResponse }';

/** Fields read from a Transaction in every call (names checked against the GraphQL reference). */
export const TRANSACTION_FIELDS = `
  id
  status
  amount { value currencyCode }
  paymentMethodSnapshot {
    ... on CreditCardTransactionDetails {
      creditCard {
        brandCode bin last4 expirationMonth expirationYear uniqueNumberIdentifier
        threeDSecure {
          authentication { authenticationStatus liabilityShifted liabilityShiftPossible cardEnrolled version }
        }
      }
    }
  }
  statusHistory {
    status
    ... on AuthorizedEvent { ${RESPONSE} }
    ... on ProcessorDeclinedEvent { declineType ${RESPONSE} }
    ... on GatewayRejectedEvent { gatewayRejectionReason ${RESPONSE} }
    ... on FailedEvent { ${RESPONSE} }
  }
`;

const CODE_CATEGORY: Readonly<Record<string, DeclineCategory>> = {
  '2001': 'insufficient_funds',
  '2002': 'insufficient_funds',
  '2003': 'insufficient_funds',
  '2005': 'invalid_number',
  '2007': 'invalid_number',
  '2008': 'invalid_number',
  '2009': 'invalid_number',
  '2051': 'invalid_number',
  '2108': 'invalid_number',
  '2004': 'invalid_expiry',
  '2006': 'invalid_expiry',
  '2010': 'invalid_cvv',
  '2099': 'three_ds_failed',
  '2058': 'three_ds_failed',
  '2012': 'processor_fraud_signal',
  '2013': 'processor_fraud_signal',
  '2014': 'processor_fraud_signal',
  '2021': 'processor_fraud_signal',
  '2047': 'processor_fraud_signal',
  '2053': 'processor_fraud_signal',
  '2000': 'do_not_honor',
  '2038': 'do_not_honor',
  '2046': 'do_not_honor',
  '2015': 'do_not_honor',
  '2019': 'do_not_honor',
  '2020': 'do_not_honor',
  '2041': 'do_not_honor',
  '2043': 'do_not_honor',
  '2044': 'do_not_honor',
  '2057': 'do_not_honor',
  '2104': 'do_not_honor',
  '2025': 'processor_error',
  '2026': 'processor_error',
  '2034': 'processor_error',
  '2105': 'processor_error',
  '2106': 'processor_error',
  '3000': 'processor_error',
};

const REASON_CATEGORY: Readonly<Record<string, DeclineCategory>> = {
  CVV: 'invalid_cvv',
  AVS_AND_CVV: 'invalid_cvv',
  THREE_D_SECURE: 'three_ds_failed',
  FRAUD: 'processor_fraud_signal',
  RISK_THRESHOLD: 'processor_fraud_signal',
  PAYMENT_METHOD_BLOCKED: 'processor_fraud_signal',
  APPLICATION_INCOMPLETE: 'processor_error',
  TOO_MANY_CONFIRMATION_ATTEMPTS: 'processor_error',
};

/** `code` is a processor response code ("2001") or a gateway rejection reason ("CVV"). */
export function mapBraintreeDecline(raw: {
  code: string | null;
  message: string | null;
}): DeclineCategory {
  const code = raw.code;
  if (!code) return 'other';
  const direct = CODE_CATEGORY[code] ?? REASON_CATEGORY[code];
  if (direct) return direct;
  // 2109 to 2999 are the generic "customer's bank is unwilling to accept the transaction" codes.
  if (/^\d{4}$/.test(code) && +code >= 2109 && +code <= 2999) return 'do_not_honor';
  return 'other';
}

/** AVS result for the postal code: MATCHES is a match, DOES_NOT_MATCH a mismatch, everything else unknown. */
export function avsPostal(code: string | null): boolean | null {
  if (code === 'MATCHES') return true;
  if (code === 'DOES_NOT_MATCH') return false;
  return null;
}

const SUCCESS_STATUS: Readonly<Record<string, ProcessorTransactionStatus>> = {
  AUTHORIZED: 'authorized',
  SUBMITTED_FOR_SETTLEMENT: 'captured',
  SETTLING: 'captured',
  SETTLED: 'captured',
  SETTLEMENT_CONFIRMED: 'captured',
  SETTLEMENT_PENDING: 'pending',
  AUTHORIZING: 'pending',
  VOIDED: 'voided',
  AUTHORIZATION_EXPIRED: 'voided',
};

function moneyOf(tx: Json, fallback: Money | null): Money {
  const value = str(obj(tx.amount)?.value);
  if (value && /^\d{1,14}(\.\d{1,4})?$/.test(value)) return Money.parse(value);
  return fallback ?? Money.zero();
}

function cardOf(tx: Json): Json | null {
  return obj(obj(tx.paymentMethodSnapshot)?.creditCard);
}

/** `uid:<unique number identifier>` when Braintree gives one, else `bin|last4|expiry|brand` (docs section 7). */
export function cardIdentity(card: Json | null): CardIdentity | null {
  if (!card) return null;
  const unique = str(card.uniqueNumberIdentifier);
  if (unique) return { type: 'fingerprint', value: `uid:${unique}` };
  const last4 = str(card.last4);
  if (!last4) return null;
  const expiry = `${str(card.expirationMonth) ?? ''}/${str(card.expirationYear) ?? ''}`;
  return {
    type: 'fingerprint',
    value: `${str(card.bin) ?? ''}|${last4}|${expiry}|${str(card.brandCode) ?? ''}`,
  };
}

/** 3D Secure result from the server-side snapshot (never from the browser's own report). */
export function readThreeDs(card: Json | null, requested: boolean): ThreeDSResult {
  const auth = obj(obj(card?.threeDSecure)?.authentication);
  const status = str(auth?.authenticationStatus);
  if (!auth || !status) return { ...NO_THREE_DS, requested };
  const shifted = auth.liabilityShifted;
  return {
    requested,
    completed: status !== 'CHALLENGE_REQUIRED',
    authenticated: status === 'AUTHENTICATE_SUCCESSFUL',
    liabilityShift: typeof shifted === 'boolean' ? shifted : null,
  };
}

function eventOf(tx: Json, statuses: readonly string[]): Json | null {
  return list(tx.statusHistory).find((e) => statuses.includes(String(e.status))) ?? null;
}

/** Builds the transaction from a Braintree Transaction object. */
export function fromTransaction(
  tx: Json,
  requested: boolean,
  fallbackAmount: Money | null,
): ProcessorTransaction {
  const status = str(tx.status) ?? '';
  const card = cardOf(tx);
  const common = {
    amount: moneyOf(tx, fallbackAmount),
    processorTransactionId: str(tx.id),
    threeDS: readThreeDs(card, requested),
    cardIdentity: cardIdentity(card),
  };
  const authorized = eventOf(tx, ['AUTHORIZED']);
  const avs = avsPostal(str(obj(authorized?.processorResponse)?.avsPostalCodeResponse));
  const mapped = SUCCESS_STATUS[status];
  if (mapped) {
    return buildTransaction({
      status: mapped,
      ...common,
      avsPostalCodeMatch: avs,
      rawCode: status,
    });
  }
  const rejected = eventOf(tx, [
    'PROCESSOR_DECLINED',
    'GATEWAY_REJECTED',
    'FAILED',
    'SETTLEMENT_DECLINED',
  ]);
  const response = obj(rejected?.processorResponse);
  const reason = str(rejected?.gatewayRejectionReason);
  const legacy = str(response?.legacyCode);
  const code = status === 'GATEWAY_REJECTED' ? (reason ?? legacy) : (legacy ?? reason);
  const message = (str(response?.message) ?? '').slice(0, 200) || null;
  const declineCategory =
    status === 'FAILED' ? 'processor_error' : mapBraintreeDecline({ code, message });
  if (
    status === 'PROCESSOR_DECLINED' ||
    status === 'GATEWAY_REJECTED' ||
    status === 'SETTLEMENT_DECLINED'
  ) {
    return buildTransaction({
      status: 'declined',
      ...common,
      declineCategory,
      rawCode: code ?? status,
      message,
      avsPostalCodeMatch: avsPostal(str(response?.avsPostalCodeResponse)),
    });
  }
  return buildTransaction({
    status: 'error',
    ...common,
    declineCategory: 'processor_error',
    rawCode: code ?? (status || null),
    message,
  });
}
