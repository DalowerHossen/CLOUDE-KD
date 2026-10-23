// path: config/s16-bankfeed.ts
// Bank feed constants (STEP 16.7). Facts are from docs/integrations/plaid.md and docs/integrations/saltedge.md (read 2026-10-23).
export const BANKFEED_PROVIDERS = ['plaid', 'saltedge'] as const;
export type BankFeedProvider = (typeof BANKFEED_PROVIDERS)[number];

export const PLAID_HOSTS = {
  sandbox: 'https://sandbox.plaid.com',
  production: 'https://production.plaid.com',
} as const;
export const PLAID_ENVIRONMENTS = ['sandbox', 'production'] as const;
export type PlaidEnvironment = (typeof PLAID_ENVIRONMENTS)[number];
export const PLAID_CLIENT_NAME = 'KD SOLUTION IT';
export const PLAID_SYNC_PAGE = 500;
export const PLAID_MAX_PAGES = 40;
export const PLAID_WEBHOOK_MAX_AGE_SECONDS = 300;
export const PLAID_COUNTRY_CODES = [
  'US',
  'GB',
  'ES',
  'NL',
  'FR',
  'IE',
  'CA',
  'DE',
  'IT',
  'PL',
  'DK',
  'NO',
  'SE',
  'EE',
  'LT',
  'LV',
  'PT',
  'BE',
  'AT',
  'FI',
] as const;

export const SALTEDGE_API = 'https://www.saltedge.com/api/v6';
export const SALTEDGE_PAGE = 500;
export const SALTEDGE_MAX_PAGES = 40;
/** The key version of Salt Edge callbacks that this code knows (the public key is in lib/integrations/saltedge.ts). */
export const SALTEDGE_KEY_VERSION = '6.0';
export const SALTEDGE_REQUEST_VALID_SECONDS = 60;

export const BANKFEED_STATUSES = [
  'new',
  'linking',
  'active',
  'needs_reauth',
  'disconnected',
  'error',
] as const;
export type BankFeedStatus = (typeof BANKFEED_STATUSES)[number];

export const MAX_BANK_CONNECTIONS_PER_COMPANY = 10;
export const BANKFEED_WEBHOOK_MAX_BYTES = 1_000_000;
export const BANKFEED_STEP_UP_SECONDS = 300;
export const BANKFEED_WEBHOOK_KEY_LENGTH = 32;
/** The platform keeps USD only; lines in another currency are counted and left out. */
export const BANKFEED_CURRENCY = 'USD';
/** A connection is synced by the cron job when its last sync is older than this. */
export const BANKFEED_SYNC_EVERY_HOURS = 12;
export const BANKFEED_SYNC_BATCH = 10;
/** Lines of one import batch (the reconciliation service takes 5000 at most). */
export const BANKFEED_IMPORT_CHUNK = 1000;
/** A re-authentication notice is sent again after this many days if the connection is still not repaired. */
export const REAUTH_NOTICE_REPEAT_DAYS = 7;
