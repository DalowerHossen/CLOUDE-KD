// path: lib/payment/adapters/authorizenet/mapping.ts
// Pure mapping of Authorize.Net responses to the platform's transaction shape (docs/processors/authorizenet.md
// sections 6 to 8). Everything read from Authorize.Net is untrusted text.
import { buildTransaction, fromMinorUnits } from '@/lib/payment/adapters/base';
import { Money } from '@/lib/utils/currency';
import type { DeclineCategory, ProcessorTransaction } from '@/types/contracts';
import { list, str, type Json } from './api';

const CODES: Readonly<Record<string, DeclineCategory>> = {
  '6': 'invalid_number',
  '37': 'invalid_number',
  '315': 'invalid_number',
  '200': 'invalid_number',
  '7': 'invalid_expiry',
  '8': 'invalid_expiry',
  '316': 'invalid_expiry',
  '317': 'invalid_expiry',
  '201': 'invalid_expiry',
  '44': 'invalid_cvv',
  '45': 'invalid_cvv',
  '65': 'invalid_cvv',
  '78': 'invalid_cvv',
  '4': 'processor_fraud_signal',
  '41': 'processor_fraud_signal',
  '250': 'processor_fraud_signal',
  '251': 'processor_fraud_signal',
  '254': 'processor_fraud_signal',
  '2': 'do_not_honor',
  '3': 'do_not_honor',
  '128': 'do_not_honor',
};
const PROCESSOR_ERRORS: ReadonlySet<string> = new Set([
  ...['19', '20', '21', '22', '23', '24', '25', '26', '29', '30', '31', '34', '35', '36', '38'],
  ...['43', '52', '57', '58', '59', '60', '61', '62', '63', '120', '121', '122', '152'],
  ...['170', '171', '172', '173', '180', '181', '192', '209', '220', '223', '224', '261', '901'],
]);

export function mapAnetDecline(raw: {
  code: string | null;
  message: string | null;
}): DeclineCategory {
  const code = raw.code;
  if (!code) return 'other';
  return CODES[code] ?? (PROCESSOR_ERRORS.has(code) ? 'processor_error' : 'other');
}

/** AVS result for the postal code: Y, Z, W, X match; A, N mismatch; everything else unknown. */
export function avsPostal(code: string | null): boolean | null {
  if (code === 'Y' || code === 'Z' || code === 'W' || code === 'X') return true;
  if (code === 'A' || code === 'N') return false;
  return null;
}

/** Decimal text ("120.50") to Money; null when it is not a plain amount. */
export function moneyFrom(value: unknown): Money | null {
  const text = typeof value === 'number' ? String(value) : str(value);
  return text && /^\d{1,13}(\.\d{1,4})?$/.test(text) ? Money.parse(text) : null;
}

/** Last four digits of a masked card number such as `XXXX0015`; null when they are not there. */
export function lastFour(masked: string | null): string | null {
  const match = masked ? /(\d{4})$/.exec(masked) : null;
  return match?.[1] ?? null;
}

function firstError(response: Json): { code: string | null; text: string | null } {
  const error = list(response.errors)[0];
  return { code: str(error?.errorCode), text: str(error?.errorText) };
}

/** A createTransactionResponse's `transactionResponse` as a platform transaction. */
export function fromTransactionResponse(
  response: Json,
  fallbackAmount: Money,
  onApproved: 'authorized' | 'captured' | 'voided' | 'refunded',
): ProcessorTransaction {
  const code = str(response.responseCode);
  const transId = str(response.transId);
  const common = {
    amount: fallbackAmount,
    // `0` means no transaction was stored (for example a refused request).
    processorTransactionId: transId && transId !== '0' ? transId : null,
    avsPostalCodeMatch: avsPostal(str(response.avsResultCode)),
    cardIdentity: null,
  };
  if (code === '1') return buildTransaction({ status: onApproved, ...common });
  if (code === '4') {
    const first = list(response.messages)[0];
    return buildTransaction({
      status: 'pending',
      ...common,
      rawCode: str(first?.code) ?? 'HELD',
      message: 'The payment is held for review by the processor.',
    });
  }
  const error = firstError(response);
  const reason = error.code ?? str(list(response.messages)[0]?.code);
  return buildTransaction({
    status: code === '3' ? 'error' : 'declined',
    ...common,
    processorTransactionId: null,
    declineCategory: mapAnetDecline({ code: reason, message: null }),
    rawCode: reason,
    message: 'The processor did not approve this request.',
  });
}

const STATUS: Readonly<Record<string, ProcessorTransaction['status']>> = {
  authorizedPendingCapture: 'authorized',
  capturedPendingSettlement: 'captured',
  settledSuccessfully: 'captured',
  refundPendingSettlement: 'refunded',
  refundSettledSuccessfully: 'refunded',
  voided: 'voided',
  expired: 'voided',
  declined: 'declined',
  approvedReview: 'authorized',
  FDSAuthorizedPendingReview: 'pending',
  FDSPendingReview: 'pending',
  underReview: 'pending',
  failedReview: 'declined',
  communicationError: 'error',
  generalError: 'error',
  settlementError: 'error',
  couldNotVoid: 'error',
};

/** The `transaction` object of getTransactionDetailsResponse. */
export function fromDetails(transaction: Json, fallbackAmount: Money | null): ProcessorTransaction {
  const state = str(transaction.transactionStatus) ?? '';
  const amount =
    moneyFrom(transaction.settleAmount) ??
    moneyFrom(transaction.authAmount) ??
    fallbackAmount ??
    fromMinorUnits(0);
  const status = STATUS[state] ?? 'error';
  const reasonCode = str(transaction.responseReasonCode);
  return buildTransaction({
    status,
    amount,
    processorTransactionId: str(transaction.transId),
    avsPostalCodeMatch: avsPostal(str(transaction.AVSResponse)),
    declineCategory:
      status === 'declined' || status === 'error'
        ? mapAnetDecline({ code: reasonCode, message: null })
        : null,
    rawCode: state || reasonCode,
  });
}
