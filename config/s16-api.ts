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
] as const;
export type ApiResource = (typeof API_RESOURCES)[number];

/** Resources a key may write to. Payments are read only through the API. */
export const WRITABLE_RESOURCES: readonly ApiResource[] = [
  'clients',
  'products',
  'invoices',
  'estimates',
  'webhooks',
];
