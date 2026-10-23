// path: lib/payment/decline.ts
// Normalized decline handling shared by the core. Adapters map their raw codes to a DeclineCategory
// (docs/processors/<id>.md section 8); the core decides from the category what to do and what to show.
import { CARD_COUNTED_FAILURES } from '@/config/payment-risk';
import { DECLINE_CATEGORIES, type DeclineCategory } from '@/types/contracts';

export function isDeclineCategory(value: unknown): value is DeclineCategory {
  return typeof value === 'string' && (DECLINE_CATEGORIES as readonly string[]).includes(value);
}

/** Card-related and authentication failures count toward the per-card limit; insufficient funds never does. */
export function isCountedFailure(category: DeclineCategory | null): boolean {
  return category !== null && CARD_COUNTED_FAILURES.includes(category);
}

/** A card the processor flagged as fraudulent goes to the blacklist. */
export function isFraudSignal(category: DeclineCategory | null): boolean {
  return category === 'processor_fraud_signal';
}

const CUSTOMER_MESSAGES: Readonly<Record<DeclineCategory, string>> = {
  insufficient_funds: 'The card has insufficient funds. Please use another card.',
  invalid_number: 'The card number was not accepted. Please check it and try again.',
  invalid_expiry: 'The expiry date was not accepted. Please check it and try again.',
  invalid_cvv: 'The security code was not accepted. Please check it and try again.',
  otp_failed: 'The one-time code was not accepted.',
  three_ds_failed: 'The card could not be verified by your bank.',
  processor_fraud_signal: 'This payment could not be completed. Please use another payment method.',
  do_not_honor: 'The card was declined by the bank. Please use another card.',
  processor_error: 'The payment service had a problem. Please try again in a moment.',
  other: 'The payment could not be completed. Please try again or use another card.',
};

/** Text safe to show the payer. Never contains the processor's raw message. */
export function customerMessage(category: DeclineCategory | null): string {
  return CUSTOMER_MESSAGES[category ?? 'other'];
}

/** Anything an adapter returned that is not a known category becomes "other". */
export function normalizeCategory(value: unknown): DeclineCategory {
  return isDeclineCategory(value) ? value : 'other';
}
