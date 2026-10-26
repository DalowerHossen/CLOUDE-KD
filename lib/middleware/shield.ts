// path: lib/middleware/shield.ts
// Request checks of the security shield, run by the proxy before the page or API code: development path block,
// body size limit, user agent / headless check and CSRF. Each check answers with a neutral error and raises a
// security event through the security contract when one is registered.
import { DEV_ONLY_PATH_PREFIXES, MAX_REQUEST_BYTES } from '@/config/security';
import { tryGetService } from '@/lib/container';
import { getServerEnv } from '@/lib/env';
import { getPublicEnv } from '@/lib/env/public';
import { contentLengthTooLarge } from '@/lib/security/http-safety';
import { NextResponse, type NextRequest } from 'next/server';
import { inspectUserAgent } from './bot-detector';
import { CSRF_COOKIE, CSRF_HEADER, checkCsrf } from './csrf';

function problem(status: number, code: string, message: string): NextResponse {
  return NextResponse.json(
    { error: { code, message, details: undefined, correlation_id: null } },
    { status, headers: { 'cache-control': 'no-store' } },
  );
}

async function raise(
  type: 'csrf_failure' | 'other',
  details: Record<string, unknown>,
): Promise<void> {
  try {
    await tryGetService('security')?.raiseSecurityEvent(type, details);
  } catch {
    // Reporting must never turn a refusal into a server error.
  }
}

export function isDevOnlyPath(pathname: string): boolean {
  return DEV_ONLY_PATH_PREFIXES.some((p) => pathname === p.slice(0, -1) || pathname.startsWith(p));
}

/** Returns a response when the request must be stopped, or null to continue. */
export async function runShield(request: NextRequest): Promise<NextResponse | null> {
  const { pathname } = request.nextUrl;
  const env = getServerEnv();

  if (env.APP_ENV === 'production' && isDevOnlyPath(pathname)) {
    return new NextResponse(null, { status: 404 });
  }
  if (contentLengthTooLarge(request.headers.get('content-length'), MAX_REQUEST_BYTES)) {
    return problem(413, 'payload_too_large', 'The request is too large.');
  }

  const bot = inspectUserAgent(request.headers.get('user-agent'), pathname);
  if (!bot.ok) {
    await raise('other', { reason: `bot_${bot.reason}`, path: pathname });
    return problem(403, 'blocked', 'The request was blocked.');
  }

  const verdict = await checkCsrf({
    method: request.method,
    pathname,
    origin: request.headers.get('origin'),
    referer: request.headers.get('referer'),
    appOrigin: new URL(getPublicEnv().NEXT_PUBLIC_APP_URL).origin,
    requestOrigin: request.nextUrl.origin,
    cookieToken: request.cookies.get(CSRF_COOKIE)?.value,
    headerToken: request.headers.get(CSRF_HEADER),
    secret: env.HMAC_TOKEN_SECRET,
  });
  if (verdict !== 'ok') {
    await raise('csrf_failure', {
      verdict,
      path: pathname,
      from: request.headers.get('origin')?.slice(0, 120) ?? null,
      to: request.nextUrl.origin,
    });
    return problem(
      403,
      'csrf_failed',
      'The request could not be verified. Reload the page and try again.',
    );
  }
  return null;
}
