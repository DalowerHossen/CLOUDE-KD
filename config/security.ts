// path: config/security.ts
// Security policy of the platform. Change values here only; no other file hard-codes them.
import type { NetworkContext } from '@/types/contracts';

/** Largest request body accepted anywhere (10 MB). withApi uses a smaller default per route. */
export const MAX_REQUEST_BYTES = 10 * 1024 * 1024;

/** Paths that exist only for development previews (ADR 0003). The proxy answers 404 for them in production. */
export const DEV_ONLY_PATH_PREFIXES: readonly string[] = ['/dev/', '/admin/dev/'];

/** Origins that may call the API from a browser (CORS). The application origin is always allowed. */
export const CORS_EXTRA_ORIGINS: readonly string[] = [];
export const CORS_ALLOWED_METHODS = 'GET, POST, PUT, PATCH, DELETE, OPTIONS';
export const CORS_ALLOWED_HEADERS = 'content-type, idempotency-key, x-csrf-token, x-correlation-id';

/** Third-party origins used by the normal pages. */
export const TURNSTILE_ORIGIN = 'https://challenges.cloudflare.com';

/** Content security policy profiles. The payment profile allows only the processor's own origins and no analytics. */
export type CspProfile = 'default' | 'payment';

/** Redirect targets after sign-in or payment must be one of these paths or start with one of these prefixes. */
export const REDIRECT_ALLOWED_PREFIXES: readonly string[] = [
  '/dashboard',
  '/admin',
  '/account',
  '/approvals',
  '/pay/',
  '/portal/',
];

/** Ports an outbound request (webhook, store URL, custom domain check) may use. */
export const SSRF_ALLOWED_PORTS: readonly number[] = [443];
export const SSRF_MAX_RESPONSE_BYTES = 1_048_576;
export const SSRF_TIMEOUT_MS = 8000;

/** Cookie names used by the security layer. */
export const CSRF_COOKIE = 'kd_csrf';
export const CSRF_HEADER = 'x-csrf-token';

/** Contexts in which an anonymising network (VPN, proxy, Tor) is blocked or only flagged. */
export const NETWORK_POLICY: Readonly<Record<NetworkContext, 'block' | 'flag'>> = {
  signup: 'block',
  payment: 'block',
  kyc: 'block',
  admin: 'block',
  login: 'flag',
  other: 'flag',
};
