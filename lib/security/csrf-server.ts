// path: lib/security/csrf-server.ts
// Server-side rotation of the CSRF token. Called when a session starts or ends so the old token dies with the session.
import 'server-only';
import { cookies } from 'next/headers';
import { CSRF_COOKIE } from '@/config/security';
import { getServerEnv } from '@/lib/env';
import { createCsrfToken } from '@/lib/middleware/csrf';

export async function rotateCsrfCookie(): Promise<void> {
  const env = getServerEnv();
  (await cookies()).set(CSRF_COOKIE, await createCsrfToken(env.HMAC_TOKEN_SECRET), {
    httpOnly: false,
    secure: env.APP_ENV === 'production',
    sameSite: 'lax',
    path: '/',
  });
}
