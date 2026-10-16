// path: lib/middleware/csrf.ts
// CSRF protection: signed double-submit cookie plus Origin check for state-changing requests.
// The cookie holds "<random>.<hmac>". The client copies it into the x-csrf-token header; the server checks that both
// are equal and that the signature is ours, so a forged cookie (cookie tossing) is useless. The token is dropped at
// sign-in and sign-out so every session gets a new one.
import { CSRF_COOKIE, CSRF_HEADER } from '@/config/security';
import { hmacSha256Hex, randomHex, timingSafeEqualStrings } from '@/lib/utils/hash';

export { CSRF_COOKIE, CSRF_HEADER };

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/** Routes that authenticate by a secret or a signature of their own and are called by servers, not browsers. */
const EXEMPT_PREFIXES: readonly string[] = [
  '/api/webhooks/',
  '/api/cron/',
  '/api/public/',
  '/api/health',
];

export async function createCsrfToken(secret: string): Promise<string> {
  const random = randomHex(24);
  return `${random}.${await hmacSha256Hex(secret, `csrf:${random}`)}`;
}

export async function isValidCsrfToken(
  token: string | undefined | null,
  secret: string,
): Promise<boolean> {
  if (!token || token.length > 200) return false;
  const [random, signature, extra] = token.split('.');
  if (!random || !signature || extra !== undefined || !/^[0-9a-f]{48}$/.test(random)) return false;
  return timingSafeEqualStrings(signature, await hmacSha256Hex(secret, `csrf:${random}`));
}

export function isCsrfExempt(pathname: string): boolean {
  return EXEMPT_PREFIXES.some(
    (p) =>
      pathname === p ||
      pathname.startsWith(p.endsWith('/') ? p : `${p}/`) ||
      pathname.startsWith(p),
  );
}

export function requiresCsrfCheck(method: string, pathname: string): boolean {
  return (
    MUTATING.has(method.toUpperCase()) && pathname.startsWith('/api/') && !isCsrfExempt(pathname)
  );
}

/** The Origin (or, when absent, the Referer origin) of a state-changing request must be the application origin. */
export function isSameOrigin(
  origin: string | null,
  referer: string | null,
  appOrigin: string,
): boolean {
  const source = origin ?? (referer ? safeOrigin(referer) : null);
  return source !== null && source === appOrigin;
}

function safeOrigin(value: string): string | null {
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

export type CsrfVerdict = 'ok' | 'bad_origin' | 'missing_token' | 'mismatch' | 'invalid_signature';

export async function checkCsrf(input: {
  method: string;
  pathname: string;
  origin: string | null;
  referer: string | null;
  appOrigin: string;
  cookieToken: string | undefined;
  headerToken: string | null;
  secret: string;
}): Promise<CsrfVerdict> {
  if (!requiresCsrfCheck(input.method, input.pathname)) return 'ok';
  if (!isSameOrigin(input.origin, input.referer, input.appOrigin)) return 'bad_origin';
  if (!input.cookieToken || !input.headerToken) return 'missing_token';
  if (!timingSafeEqualStrings(input.cookieToken, input.headerToken)) return 'mismatch';
  if (!(await isValidCsrfToken(input.cookieToken, input.secret))) return 'invalid_signature';
  return 'ok';
}
