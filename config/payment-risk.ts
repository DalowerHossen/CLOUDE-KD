// path: config/payment-risk.ts
// Every number of the card rules and the payment verification lives here (REQ-CARD, REQ-VERIFY). No other file repeats them.
import type { DeclineCategory } from '@/types/contracts';

/** After one successful card payment on an invoice, the same card cannot pay that invoice again for this long. */
export const SAME_CARD_SAME_INVOICE_HOURS = 24;

/** Rolling window and limit for card-related failures per card identity; the attempt after the limit is rejected. */
export const CARD_FAIL_WINDOW_HOURS = 24;
export const CARD_FAIL_LIMIT = 2;

/** Failure categories that count. Insufficient funds, processor errors and the rest never count. */
export const CARD_COUNTED_FAILURES: readonly DeclineCategory[] = [
  'invalid_number',
  'invalid_expiry',
  'invalid_cvv',
  'otp_failed',
  'three_ds_failed',
];

/** Velocity limits over CARD_VELOCITY_WINDOW_HOURS. */
export const CARD_VELOCITY_WINDOW_HOURS = 1;
export const CARD_ATTEMPTS_PER_HOUR = 5;
export const IP_ATTEMPTS_PER_HOUR = 10;
export const IP_DISTINCT_CARDS_PER_HOUR = 3;

/** An authorization waits this long for a reviewer, then is voided. Never longer than the processor allows. */
export const REVIEW_HOLD_HOURS = 72;

/** A passing test of a mode stays valid for this many hours (REQ-NMI-MODES). */
export const MODE_TEST_VALID_HOURS = 24;

/** Validity of a payment link and the largest number of times one link may start a payment. */
export const PAYMENT_LINK_VALID_HOURS = 168;
export const PAYMENT_LINK_MAX_VALID_HOURS = 720;

/** Webhook processing: attempts before a delivery moves to the dead-letter list, and the wait between attempts. */
export const WEBHOOK_MAX_ATTEMPTS = 5;
export const WEBHOOK_RETRY_BASE_SECONDS = 60;

/** Refunds above this amount (USD) need the approval chain; smaller ones need the refund permission only. */
export const REFUND_APPROVAL_THRESHOLD_USD = '500.0000';

/** Payments that stay in `created` or `requires_action` longer than this are failed by the cleanup job. */
export const PAYMENT_OPEN_EXPIRY_MINUTES = 60;

/** Refund policy text shown on the payment page and the receipt (string key from the payment strings). */
export const REFUND_POLICY_KEY = 'payment.refundPolicy';
