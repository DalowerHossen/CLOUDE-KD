// path: config/s16-commerce.ts
// Commerce connection constants (STEP 16.5). Facts are from docs/integrations/shopify.md and docs/integrations/woocommerce.md
// (read 2026-10-23).
export const COMMERCE_PROVIDERS = ['shopify', 'woocommerce'] as const;
export type CommerceProvider = (typeof COMMERCE_PROVIDERS)[number];

/** The Admin API version in the address. 2026-10 is the latest stable version on 2026-10-23 (supported until 2027-10-16). */
export const SHOPIFY_API_VERSION = '2026-10';
export const SHOPIFY_DOMAIN_SUFFIX = '.myshopify.com';
export const SHOPIFY_WEBHOOK_TOPICS = ['ORDERS_CREATE', 'ORDERS_UPDATED', 'REFUNDS_CREATE'] as const;
export const WOOCOMMERCE_API_PATH = '/wp-json/wc/v3';
export const WOOCOMMERCE_WEBHOOK_TOPICS = ['order.created', 'order.updated'] as const;

export const COMMERCE_TIMEOUT_MS = 20_000;
export const COMMERCE_RESPONSE_MAX_BYTES = 2_000_000;
export const COMMERCE_WEBHOOK_MAX_BYTES = 2_000_000;
export const COMMERCE_STEP_UP_SECONDS = 300;
export const MAX_CONNECTIONS_PER_COMPANY = 10;
export const WEBHOOK_KEY_LENGTH = 32;

export const SYNC_MODES = ['realtime', 'hourly', 'daily'] as const;
export type SyncMode = (typeof SYNC_MODES)[number];

export const ORDER_STATUSES = [
  'received',
  'conflict',
  'client_ready',
  'synced',
  'failed',
  'ignored',
  'cancelled',
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const CONFLICT_KINDS = ['currency', 'unmapped_sku', 'no_email', 'no_address', 'refund'] as const;
export type ConflictKind = (typeof CONFLICT_KINDS)[number];

/** The platform keeps money in one currency. An order in another currency waits as a conflict. */
export const ORDER_CURRENCY = 'USD';
export const MAX_ORDER_LINES = 200;
export const MAX_ORDER_ATTEMPTS = 5;
/** Minutes to wait after the first, second, third and later failures of an order. */
export const ORDER_RETRY_MINUTES: readonly number[] = [5, 30, 120, 720];
export const ORDER_BATCH = 25;
export const SYNC_LOG_KEEP_DAYS = 90;
export const MAX_MAPPINGS_PER_CONNECTION = 5000;
