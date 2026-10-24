// path: lib/auth/session.ts
// Pure session helpers: cookie settings, expiry and a short device label. No secrets, no I/O.
import { REMEMBER_ME_SECONDS, SESSION_TIMEOUT_SECONDS } from '@/config/auth-lock';

/**
 * Cookie decision (STEP 03.7): session cookies are HttpOnly and Secure with SameSite=Lax, not Strict.
 * Strict would drop the cookie on the return redirect from OAuth providers and from payment processors, which
 * would sign the user out in the middle of a payment. Cross-site requests that change state are stopped by the
 * CSRF check (Origin header must match) and by the fact that every mutating API requires JSON content.
 */
export const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: 'lax' as const,
  path: '/',
};

export function cookieSecure(): boolean {
  return process.env.NODE_ENV === 'production';
}

export function sessionLifetimeSeconds(rememberMe: boolean): number {
  return rememberMe ? REMEMBER_ME_SECONDS : SESSION_TIMEOUT_SECONDS;
}

export function sessionExpiry(from: Date, rememberMe: boolean): Date {
  return new Date(from.getTime() + sessionLifetimeSeconds(rememberMe) * 1000);
}

/** "Chrome on Windows" style label from a user-agent string. Never stores the raw user agent. */
export function deviceLabel(userAgent: string | null): string {
  if (!userAgent) return 'Unknown device';
  const ua = userAgent.slice(0, 400);
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /OPR\/|Opera/.test(ua)
      ? 'Opera'
      : /Firefox\//.test(ua)
        ? 'Firefox'
        : /Chrome\//.test(ua)
          ? 'Chrome'
          : /Safari\//.test(ua)
            ? 'Safari'
            : 'Browser';
  const os = /Windows/.test(ua)
    ? 'Windows'
    : /Android/.test(ua)
      ? 'Android'
      : /iPhone|iPad|iOS/.test(ua)
        ? 'iOS'
        : /Mac OS X|Macintosh/.test(ua)
          ? 'macOS'
          : /Linux/.test(ua)
            ? 'Linux'
            : 'Unknown OS';
  return `${browser} on ${os}`;
}

/** True when the session is past its end time or has been revoked. */
export function isSessionActive(
  session: { expiresAt: string; revokedAt: string | null },
  now: Date,
): boolean {
  return session.revokedAt === null && Date.parse(session.expiresAt) > now.getTime();
}

/** Inactivity limit: a session idle for longer than the limit ends. */
export function isIdleTooLong(lastActiveAt: string, now: Date, limitSeconds: number): boolean {
  return now.getTime() - Date.parse(lastActiveAt) > limitSeconds * 1000;
}
