// path: config/s16-api.ts
// Public API constants (STEP 16.1): key formats, limits, scopes and the usage rules.
export const API_KEY_LIVE_PREFIX = 'kd_live_';
export const API_KEY_TEST_PREFIX = 'kd_test_';
/** Random characters after the prefix (base62, about 190 bits). */
export const API_KEY_RANDOM_LENGTH = 32;
/** Characters of the key kept in clear for display and support (prefix plus the first random characters). */
export const API_KEY_DISPLAY_LENGTH = 14;
export const API_KEY_LAST_CHARS = 4;

export const DEFAULT_RATE_LIMIT_PER_MINUTE = 120;
export const MIN_RATE_LIMIT_PER_MINUTE = 1;
export const MAX_RATE_LIMIT_PER_MINUTE = 10_000;
export const MAX_KEYS_PER_COMPANY = 50;
export const MAX_KEY_LIFETIME_DAYS = 730;
export const DEFAULT_ROTATION_OVERLAP_HOURS = 24;
export const MAX_ROTATION_OVERLAP_HOURS = 72;
/** Fresh identity check (seconds) for creating, rotating or revoking a key. */
export const API_KEY_STEP_UP_SECONDS = 300;

/** A day with at least this many requests and more than `ANOMALY_FACTOR` times the average of the last seven days is flagged. */
export const ANOMALY_MIN_REQUESTS = 200;
export const ANOMALY_FACTOR = 5;
export const ANOMALY_HISTORY_DAYS = 7;

export const API_VERSION = 'v1';
export const MAX_PAGE_SIZE = 100;
export const DEFAULT_PAGE_SIZE = 25;

export const API_RESOURCES = [
  'clients',
  'products',
  'invoices',
  'estimates',
  'payments',
  'webhooks',
  'checkout',
] as const;
export type ApiResource = (typeof API_RESOURCES)[number];

/** Resources a key may write to. Payments are read only through the API. A `checkout` key makes and cancels hosted checkout sessions. */
export const WRITABLE_RESOURCES: readonly ApiResource[] = [
  'clients',
  'products',
  'invoices',
  'estimates',
  'webhooks',
  'checkout',
];

/* ---------- outgoing webhooks (16.2) ---------- */

/** The events a webhook endpoint can subscribe to. Security, sign-in, KYC, file and payroll events never leave the platform. */
export const WEBHOOK_EVENTS = [
  'invoice.created',
  'invoice.sent',
  'invoice.viewed',
  'invoice.paid',
  'invoice.partially_paid',
  'invoice.voided',
  'invoice.overdue',
  'estimate.sent',
  'estimate.approved',
  'estimate.rejected',
  'payment.authorized',
  'payment.captured',
  'payment.failed',
  'payment.pending_review',
  'payment.voided',
  'payment.refunded',
  'dispute.opened',
  'dispute.evidence_submitted',
  'dispute.won',
  'dispute.lost',
  'payout.requested',
  'payout.approved',
  'payout.paid',
  'payout.failed',
  'client.created',
  'client.updated',
  'subscription.created',
  'subscription.renewed',
  'subscription.cancelled',
  'checkout.session.paid',
  'checkout.session.failed',
] as const;
export type WebhookEventName = (typeof WEBHOOK_EVENTS)[number];

export const WEBHOOK_MAX_ENDPOINTS = 20;
export const WEBHOOK_SECRET_PREFIX = 'whsec_';
export const WEBHOOK_SECRET_RANDOM_LENGTH = 40;
export const WEBHOOK_SECRET_OVERLAP_HOURS = 24;
export const WEBHOOK_SIGNATURE_TOLERANCE_SECONDS = 300;
/** Delay (seconds) before attempt 2, 3, ... after a failed attempt. There are at most `WEBHOOK_MAX_ATTEMPTS` attempts. */
export const WEBHOOK_RETRY_SECONDS: readonly number[] = [
  60, 300, 1800, 7200, 21_600, 43_200, 86_400,
];
export const WEBHOOK_MAX_ATTEMPTS = WEBHOOK_RETRY_SECONDS.length + 1;
/** An endpoint is switched off after this many failed attempts in a row. */
export const WEBHOOK_DISABLE_AFTER_FAILURES = 10;
export const WEBHOOK_TIMEOUT_MS = 10_000;
export const WEBHOOK_RESPONSE_CLIP = 2000;
export const WEBHOOK_BATCH = 25;
export const WEBHOOK_LOCK_SECONDS = 60;
export const WEBHOOK_MAX_URL_LENGTH = 2000;
