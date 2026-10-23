// path: lib/payment/adapters/payarc/mapping.ts
// Pure mapping of PayArc charges, refunds and response codes to the platform's transaction shape
// (docs/processors/payarc.md sections 5, 7 and 8).
import { buildTransaction, fromMinorUnits } from '@/lib/payment/adapters/base';
import type { Money } from '@/lib/utils/currency';
import type { CardIdentity, DeclineCategory, ProcessorTransaction } from '@/types/contracts';
import { list, obj, str, type Json } from './api';

const CODES: Readonly<Record<string, DeclineCategory>> = {
  D2012: 'insufficient_funds',
  'DECLINED-051': 'insufficient_funds',
  'INSUFFICIENT FUNDS': 'insufficient_funds',
  D2005: 'invalid_number',
  'INVALID CARD NUMBER': 'invalid_number',
  D2011: 'invalid_expiry',
  D2028: 'invalid_expiry',
  'EXPIRED CARD': 'invalid_expiry',
  'INVALID DATE': 'invalid_expiry',
  D2020: 'invalid_cvv',
  'INVALID CVV': 'invalid_cvv',
  D9099: 'three_ds_failed',
  D2002: 'processor_fraud_signal',
  D2029: 'processor_fraud_signal',
  D2001: 'do_not_honor',
  D2015: 'do_not_honor',
  D2026: 'do_not_honor',
  D2031: 'do_not_honor',
  D2032: 'do_not_honor',
  D2999: 'do_not_honor',
  'DECLINED-005': 'do_not_honor',
  'DECLINED-182': 'do_not_honor',
  'DECLINED-XXX': 'do_not_honor',
  'RESTRICTED CARD': 'do_not_honor',
  DECLINED: 'do_not_honor',
  'DO NOT HONOR': 'do_not_honor',
  D0050: 'processor_error',
  D0092: 'processor_error',
  D1006: 'processor_error',
  D2010: 'processor_error',
  D2021: 'processor_error',
  D2030: 'processor_error',
  D9503: 'processor_error',
  D9506: 'processor_error',
  D9507: 'processor_error',
  SYSTEMERROR: 'processor_error',
};

/** The response code is tried first, then the status or message text. */
export function mapPayarcDecline(raw: {
  code: string | null;
  message: string | null;
}): DeclineCategory {
  const byCode = raw.code ? CODES[raw.code.trim().toUpperCase()] : undefined;
  if (byCode) return byCode;
  const byText = raw.message ? CODES[raw.message.trim().toUpperCase()] : undefined;
  return byText ?? 'other';
}

/** Cents as the API prints them: an integer or an integer in text. */
export function centsOf(value: unknown): Money | null {
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0)
    return fromMinorUnits(value);
  if (typeof value === 'string' && /^\d{1,15}$/.test(value)) return fromMinorUnits(value);
  return null;
}

export function cardIdentity(card: Json | null): CardIdentity | null {
  if (!card) return null;
  const fingerprint = str(card.fingerprint);
  if (fingerprint) return { type: 'fingerprint', value: fingerprint };
  const last4 = str(card.last4digit);
  if (!last4) return null;
  const first6 = card.first6digit === undefined ? '' : String(card.first6digit);
  return {
    type: 'fingerprint',
    value: `${first6}|${last4}|${str(card.brand) ?? ''}|${str(card.exp_month) ?? ''}/${str(card.exp_year) ?? ''}`,
  };
}

/** Postal code check of the issuer: a pass is a match, an explicit "N" with a failed check is a mismatch. */
export function avsPostal(card: Json | null): boolean | null {
  if (!card) return null;
  if (card.zip_check_passed === 1) return true;
  if (card.zip_check_passed === 0 && str(card.avs_status) === 'N') return false;
  return null;
}

/** The charge object of an answer (`{ data: Charge }`). */
export function chargeOf(body: Json): Json | null {
  const data = obj(body.data);
  return data && str(data.id) ? data : null;
}

/** A refused request (HTTP 4xx) as a failed step. */
export function failureFromBody(body: Json, amount: Money): ProcessorTransaction {
  const message = str(body.message);
  const code = str(body.failure_code) ?? str(body.code);
  const validation = obj(body.errors) !== null;
  return buildTransaction({
    status: 'declined',
    amount,
    declineCategory: validation ? 'other' : mapPayarcDecline({ code, message }),
    rawCode: validation ? 'VALIDATION' : (code ?? message),
    message: 'PayArc could not process this request.',
  });
}

/** Builds the transaction from a PayArc Charge object. */
export function fromCharge(charge: Json, fallbackAmount: Money | null): ProcessorTransaction {
  const card = obj(obj(charge.card)?.data);
  const amount = centsOf(charge.amount) ?? fallbackAmount ?? fromMinorUnits(0);
  const common = {
    amount,
    processorTransactionId: str(charge.id),
    avsPostalCodeMatch: avsPostal(card),
    cardIdentity: cardIdentity(card),
    rawCode: str(charge.failure_code) ?? str(charge.status),
  };
  const status = (str(charge.status) ?? '').toLowerCase();
  const failureCode = str(charge.failure_code);
  if (failureCode || status === 'failed_by_gateway') {
    return buildTransaction({
      status: 'declined',
      ...common,
      declineCategory: mapPayarcDecline({
        code: failureCode,
        message: str(charge.failure_message) ?? str(charge.status),
      }),
      rawCode: failureCode ?? 'failed_by_gateway',
    });
  }
  if (status === 'authorized') return buildTransaction({ status: 'authorized', ...common });
  if (status === 'submitted_for_settlement' || status === 'partial_refund' || status === 'settled')
    return buildTransaction({ status: 'captured', ...common });
  if (status === 'void') return buildTransaction({ status: 'voided', ...common });
  if (status === 'refunded') return buildTransaction({ status: 'refunded', ...common });
  return buildTransaction({
    status: 'error',
    ...common,
    declineCategory: 'processor_error',
  });
}

/** The newest refund recorded on a charge answer, when the answer lists one. */
export function latestRefund(charge: Json): Json | null {
  const refunds = list(obj(charge.refund)?.data);
  let best: Json | null = null;
  let bestTime = -1;
  for (const refund of refunds) {
    const time = typeof refund.created_at === 'number' ? refund.created_at : 0;
    if (best === null || time >= bestTime) {
      best = refund;
      bestTime = time;
    }
  }
  return best;
}
