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

/**
 * How long an authorization stays valid at the processor. A review hold never exceeds this. The default is the
 * shortest common value; an adapter sub-step may list the documented value of its processor here.
 */
export const DEFAULT_AUTH_VALIDITY_HOURS = 168;
export const AUTH_VALIDITY_HOURS_BY_PROCESSOR: Readonly<Partial<Record<string, number>>> = {
  // Stripe: 7 days for customer-initiated card-not-present payments, 4 days 18 hours for merchant-initiated Visa.
  stripe: 114,
  // PayPal: an authorization lasts 29 days; the documented honor period (best success rate) is 3 days.
  paypal: 72,
  // Braintree: American Express and Mastercard final authorizations last 7 days, Visa merchant-initiated 3 days.
  braintree: 72,
  // BlueSnap: card schemes hold an authorization for 3 to 10 days; a reversal is possible within 8 days.
  bluesnap: 72,
  // Square: card-not-present authorizations are cancelled by Square after 7 days; the adapter asks for 6 days.
  square: 144,
  // Verifone: issuers release an unused authorization after 7 to 30 days; the platform keeps it inside 6 days.
  verifone: 144,
};

/** A passing test of a mode stays valid for this many hours (REQ-NMI-MODES). */
export const MODE_TEST_VALID_HOURS = 24;

/** Validity of a payment link and the largest number of times one link may start a payment. */
export const PAYMENT_LINK_VALID_HOURS = 168;
export const PAYMENT_LINK_MAX_VALID_HOURS = 720;

/** Webhook processing: attempts before a delivery moves to the dead-letter list, and the wait between attempts. */
export const WEBHOOK_MAX_ATTEMPTS = 5;
export const WEBHOOK_RETRY_BASE_SECONDS = 60;

/** Refunds above this amount (USD) need the CEO (approval action payment.refund.large). */
export const REFUND_APPROVAL_THRESHOLD_USD = '500.0000';

/** A payment can be refunded for this many days after capture (policy shown to the payer). */
export const REFUND_WINDOW_DAYS = 180;

/** Card surcharge in percent of the amount, shown to the payer before paying. Zero means no surcharge. */
export const CARD_SURCHARGE_PERCENT = '0';

/** Payments that stay in `created` or `requires_action` longer than this are failed by the cleanup job. */
export const PAYMENT_OPEN_EXPIRY_MINUTES = 60;

/** Refund policy text shown on the payment page and the receipt (string key from the payment strings). */
export const REFUND_POLICY_KEY = 'payment.refundPolicy';
