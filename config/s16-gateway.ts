// path: config/s16-gateway.ts
// Settings of the sub-merchant gateway (STEP 16.12).
export const GATEWAY_KEY_PREFIX = 'kd_sub_';
export const GATEWAY_KEY_RANDOM_LENGTH = 32;
export const GATEWAY_KEY_DISPLAY_LENGTH = 12;
export const GATEWAY_KEY_LAST_CHARS = 4;

export const GATEWAY_SECRET_PREFIX = 'gwsec_';
export const GATEWAY_SECRET_RANDOM_LENGTH = 40;
export const GATEWAY_SECRET_OVERLAP_HOURS = 24;

export const GATEWAY_DEFAULT_RATE_PER_MINUTE = 60;
export const GATEWAY_MAX_RATE_PER_MINUTE = 10_000;
export const GATEWAY_MAX_SUB_MERCHANTS = 500;
export const GATEWAY_MAX_KEYS_PER_SUB_MERCHANT = 5;
export const GATEWAY_MAX_ROUTES = 100;
export const GATEWAY_MAX_ALLOWED_IPS = 20;
export const GATEWAY_MAX_KEY_LIFETIME_DAYS = 730;

export const GATEWAY_MAX_REQUEST_BYTES = 1_048_576;
export const GATEWAY_MAX_RESPONSE_BYTES = 1_048_576;
export const GATEWAY_MAX_PATH_SEGMENTS = 12;
export const GATEWAY_MAX_PATH_LENGTH = 200;
export const GATEWAY_MAX_QUERY_PAIRS = 30;
export const GATEWAY_MAX_QUERY_LENGTH = 1500;

export const GATEWAY_DEFAULT_TIMEOUT_MS = 15_000;
export const GATEWAY_STEP_UP_SECONDS = 300;
export const GATEWAY_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const;
export type GatewayMethod = (typeof GATEWAY_METHODS)[number];

/** Answer types of the main merchant's app that are passed on to a sub-merchant. */
export const GATEWAY_RESPONSE_TYPES = [
  'application/json',
  'text/plain',
  'text/csv',
  'application/pdf',
] as const;
