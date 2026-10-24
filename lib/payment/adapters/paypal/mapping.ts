// path: lib/payment/adapters/paypal/mapping.ts
// Pure mapping of PayPal order objects to the platform's transaction shape (docs/processors/paypal.md sections 6 to 8).
import { buildTransaction, fromMinorUnits, NO_THREE_DS } from '@/lib/payment/adapters/base';
import { Money } from '@/lib/utils/currency';
import type {
  CardIdentity,
  DeclineCategory,
  ProcessorTransaction,
  ThreeDSResult,
} from '@/types/contracts';
import { list, obj, str, type Json } from './api';

const RESPONSE_CODES: Readonly<Record<string, DeclineCategory>> = {
  '5120': 'insufficient_funds',
  '1330': 'invalid_number',
  '5180': 'invalid_number',
  '0390': 'invalid_number',
  '6300': 'invalid_number',
  '5400': 'invalid_expiry',
  '1380': 'invalid_expiry',
  PPEX: 'invalid_expiry',
  PPEF: 'invalid_expiry',
  '00N7': 'invalid_cvv',
  '5110': 'invalid_cvv',
  '1382': 'invalid_cvv',
  PCVV: 'invalid_cvv',
  PPC2: 'invalid_cvv',
  '5650': 'three_ds_failed',
  '7700': 'three_ds_failed',
  '7710': 'three_ds_failed',
  PPD3: 'three_ds_failed',
  ORDER_NOT_APPROVED: 'three_ds_failed',
  '9500': 'processor_fraud_signal',
  '9520': 'processor_fraud_signal',
  '5150': 'processor_fraud_signal',
  '0500': 'do_not_honor',
  '9540': 'do_not_honor',
  '5100': 'do_not_honor',
  '5140': 'do_not_honor',
  '5160': 'do_not_honor',
  '0580': 'do_not_honor',
  '5700': 'do_not_honor',
  '10BR': 'do_not_honor',
  PP06: 'do_not_honor',
  PPAB: 'do_not_honor',
  '5930': 'do_not_honor',
  INSTRUMENT_DECLINED: 'do_not_honor',
  TRANSACTION_REFUSED: 'do_not_honor',
  CARD_EXPIRED: 'invalid_expiry',
  '0960': 'processor_error',
  '8000': 'processor_error',
  '8010': 'processor_error',
  '8020': 'processor_error',
  '8100': 'processor_error',
  '8110': 'processor_error',
  '8220': 'processor_error',
  '5910': 'processor_error',
  '5920': 'processor_error',
  '9100': 'processor_error',
  '0800': 'processor_error',
  PPER: 'processor_error',
  PPNT: 'processor_error',
  '9600': 'processor_error',
};

export function mapPaypalDecline(raw: {
  code: string | null;
  message: string | null;
}): DeclineCategory {
  return (raw.code && RESPONSE_CODES[raw.code]) || 'other';
}

const AVS_MATCH = new Set(['M', 'D', 'F', 'P', 'W', 'X', 'Y', 'Z']);
const AVS_NO_MATCH = new Set(['A', 'B', 'C', 'N', 'E']);

export function avsPostal(code: string | null): boolean | null {
  if (!code) return null;
  if (AVS_MATCH.has(code)) return true;
  if (AVS_NO_MATCH.has(code)) return false;
  return null;
}

export interface ThreeDsReading {
  result: ThreeDSResult;
  /** False when PayPal's table says "do not continue with authorization". */
  mayContinue: boolean;
}

/** `authentication_result` of the card payment source, read with PayPal's recommended-action table. */
export function readAuthentication(card: Json | null, requested: boolean): ThreeDsReading {
  const auth = obj(card?.authentication_result);
  if (!auth) return { result: { ...NO_THREE_DS, requested }, mayContinue: true };
  const liability = str(auth.liability_shift);
  const secure = obj(auth.three_d_secure);
  const enrollment = str(secure?.enrollment_status);
  const status = str(secure?.authentication_status);
  const liabilityShift = liability === 'POSSIBLE' ? true : liability === 'NO' ? false : null;
  let mayContinue: boolean;
  if (liability === 'UNKNOWN' || liability === null) mayContinue = false;
  else if (enrollment === 'Y')
    mayContinue = (status === 'Y' || status === 'A') && liability === 'POSSIBLE';
  else mayContinue = liability === 'NO';
  const completed = enrollment === 'Y' && status !== null && status !== 'C';
  return {
    result: {
      requested,
      completed,
      authenticated: enrollment === 'Y' && status === 'Y',
      liabilityShift,
    },
    mayContinue,
  };
}

export function cardIdentity(card: Json | null): CardIdentity | null {
  const last = str(card?.last_digits);
  if (!last) return null;
  const bin = str(obj(card?.bin_details)?.bin) ?? '';
  const expiry = str(card?.expiry) ?? str(obj(card?.from_request)?.expiry) ?? '';
  const brand = str(card?.brand) ?? '';
  return { type: 'fingerprint', value: `${bin}|${last}|${expiry}|${brand}` };
}

export interface OrderView {
  id: string;
  status: string;
  amount: Money | null;
  currency: string | null;
  customId: string | null;
  card: Json | null;
  authorization: Json | null;
  capture: Json | null;
  refunds: Json[];
  payerActionUrl: string | null;
}

export function readOrder(order: Json): OrderView {
  const unit = list(order.purchase_units)[0] ?? null;
  const amountObj = obj(unit?.amount);
  const value = str(amountObj?.value);
  const payments = obj(unit?.payments);
  const authorizations = list(payments?.authorizations);
  const captures = list(payments?.captures);
  const pickAuth =
    authorizations.find((a) => str(a.status) !== 'VOIDED') ?? authorizations[0] ?? null;
  const pickCapture =
    captures.find((c) =>
      ['COMPLETED', 'PARTIALLY_REFUNDED', 'PENDING'].includes(String(c.status)),
    ) ??
    captures[0] ??
    null;
  const link = list(order.links).find((l) => str(l.rel) === 'payer-action');
  return {
    id: str(order.id) ?? '',
    status: str(order.status) ?? '',
    amount: value && /^\d{1,14}(\.\d{1,2})?$/.test(value) ? Money.parse(value) : null,
    currency: str(amountObj?.currency_code),
    customId: str(unit?.custom_id),
    card: obj(obj(order.payment_source)?.card),
    authorization: pickAuth,
    capture: pickCapture,
    refunds: list(payments?.refunds),
    payerActionUrl: str(link?.href),
  };
}

function declineFrom(
  response: Json | null,
  issue: string | null,
): { category: DeclineCategory; code: string | null } {
  const code = str(response?.response_code);
  const category = mapPaypalDecline({ code: code ?? issue, message: null });
  return { category, code: code ?? issue };
}

/** Builds the transaction from the order after (or without) an authorization. */
export function fromOrder(
  view: OrderView,
  requested: boolean,
  fallbackAmount: Money | null,
): ProcessorTransaction {
  const reading = readAuthentication(view.card, requested);
  const response =
    obj(view.authorization?.processor_response) ?? obj(view.capture?.processor_response);
  const common = {
    amount: view.amount ?? fallbackAmount ?? fromMinorUnits(0),
    processorTransactionId: view.id || null,
    threeDS: reading.result,
    avsPostalCodeMatch: avsPostal(str(response?.avs_code)),
    cardIdentity: cardIdentity(view.card),
  };
  const capture = view.capture;
  const captureStatus = str(capture?.status);
  if (captureStatus === 'COMPLETED' || captureStatus === 'PARTIALLY_REFUNDED')
    return buildTransaction({ status: 'captured', ...common });
  if (captureStatus === 'REFUNDED') return buildTransaction({ status: 'refunded', ...common });
  if (captureStatus === 'PENDING') return buildTransaction({ status: 'pending', ...common });
  if (captureStatus === 'DECLINED' || captureStatus === 'FAILED') {
    const d = declineFrom(obj(capture?.processor_response), null);
    return buildTransaction({
      status: 'declined',
      ...common,
      declineCategory: d.category,
      rawCode: d.code,
    });
  }
  const auth = view.authorization;
  const authStatus = str(auth?.status);
  if (authStatus === 'CREATED' || authStatus === 'PARTIALLY_CAPTURED')
    return buildTransaction({ status: 'authorized', ...common });
  if (authStatus === 'PENDING') return buildTransaction({ status: 'pending', ...common });
  if (authStatus === 'VOIDED') return buildTransaction({ status: 'voided', ...common });
  if (authStatus === 'DENIED') {
    const d = declineFrom(response, null);
    return buildTransaction({
      status: 'declined',
      ...common,
      declineCategory: d.category,
      rawCode: d.code,
    });
  }
  if (view.status === 'PAYER_ACTION_REQUIRED' && view.payerActionUrl) {
    return buildTransaction({
      status: 'requires_action',
      ...common,
      requiredAction: { kind: 'redirect', url: view.payerActionUrl, clientSecret: null },
    });
  }
  if (view.status === 'VOIDED') return buildTransaction({ status: 'voided', ...common });
  return buildTransaction({ status: 'pending', ...common });
}

export function failureFromError(status: number, body: Json, amount: Money): ProcessorTransaction {
  const first = list(body.details)[0];
  const issue = str(first?.issue) ?? str(body.name);
  return buildTransaction({
    status: status === 422 || status === 400 ? 'declined' : 'error',
    amount,
    declineCategory: mapPaypalDecline({ code: issue, message: null }),
    rawCode: issue,
    message: str(first?.description) ?? str(body.message),
  });
}
