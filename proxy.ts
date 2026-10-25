// path: proxy.ts
// Next.js 16 request proxy (the former middleware). Runs on the Node.js runtime for every page and API request:
// 1. the modules of the middleware chain (security shield: development path block, size limit, bot check, CSRF),
// 2. the per-request nonce and content security policy, 3. the fixed security headers, 4. CORS, 5. the CSRF cookie.
import { NextResponse, type NextRequest } from 'next/server';
import { CSRF_COOKIE } from '@/config/security';
import { getServerEnv } from '@/lib/env';
import { getPublicEnv } from '@/lib/env/public';
import { middlewareChain } from '@/lib/middleware/chain.generated';
import { createCsrfToken, isValidCsrfToken } from '@/lib/middleware/csrf';
import { buildRequestSecurity, corsHeaders } from '@/lib/middleware/headers';

function withHeaders(response: NextResponse, headers: Record<string, string>): NextResponse {
  for (const [name, value] of Object.entries(headers)) response.headers.set(name, value);
  return response;
}

export async function proxy(request: NextRequest): Promise<NextResponse> {
  const env = getServerEnv();
  const publicEnv = getPublicEnv();
  const production = env.APP_ENV === 'production';
  const appOrigin = new URL(publicEnv.NEXT_PUBLIC_APP_URL).origin;
  const { pathname } = request.nextUrl;
  // The embed page may be framed, but only by the web sites the merchant listed for that payment link.
  const embedToken = /^\/embed\/([A-Za-z0-9_-]{16,200})$/.exec(pathname)?.[1];
  const frameAncestors = embedToken
    ? await import('@/services/payment/embed').then((m) => m.ancestorsFor(embedToken))
    : undefined;
  const security = buildRequestSecurity({
    pathname,
    production,
    supabaseOrigin: publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    ...(frameAncestors ? { frameAncestors } : {}),
  });

  // Cross-origin preflight for the API: answered here, only for allowed origins.
  if (request.method === 'OPTIONS' && pathname.startsWith('/api/')) {
    const cors = corsHeaders(request.headers.get('origin'), appOrigin);
    return withHeaders(new NextResponse(null, { status: cors ? 204 : 403 }), {
      ...security.responseHeaders,
      ...(cors ?? {}),
    });
  }

  for (const entry of middlewareChain) {
    const stopped = await entry.run(request);
    if (stopped) return withHeaders(stopped, security.responseHeaders);
  }

  const forwarded = new Headers(request.headers);
  forwarded.set('x-nonce', security.nonce);
  forwarded.set('x-pathname', pathname);
  forwarded.set('content-security-policy', security.csp);
  const response = NextResponse.next({ request: { headers: forwarded } });
  withHeaders(response, security.responseHeaders);
  // The merchant SDK script is loaded by other web sites with a script tag.
  if (pathname.startsWith('/embed/v1/'))
    response.headers.set('cross-origin-resource-policy', 'cross-origin');

  const cors = pathname.startsWith('/api/')
    ? corsHeaders(request.headers.get('origin'), appOrigin)
    : null;
  if (cors) withHeaders(response, cors);

  const existing = request.cookies.get(CSRF_COOKIE)?.value;
  if (!(await isValidCsrfToken(existing, env.HMAC_TOKEN_SECRET))) {
    response.cookies.set(CSRF_COOKIE, await createCsrfToken(env.HMAC_TOKEN_SECRET), {
      httpOnly: false,
      secure: production,
      sameSite: 'lax',
      path: '/',
    });
  }
  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|favicon.svg|brand/|robots.txt|sitemap.xml|manifest.webmanifest).*)',
  ],
};
