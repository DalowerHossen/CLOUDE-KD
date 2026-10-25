// path: lib/middleware/headers.ts
// Builds the per-request security headers (nonce, CSP, fixed headers) and the CORS answer.
import { CORS_ALLOWED_HEADERS, CORS_ALLOWED_METHODS, CORS_EXTRA_ORIGINS } from '@/config/security';
import { paymentPageOrigins } from '@/lib/payment/csp';
import { buildCsp, buildTrustedTypesPolicy, profileForPath } from '@/lib/security/csp';
import { securityHeaders } from '@/lib/security/headers';
import { randomBase64Url } from '@/lib/utils/hash';

export interface RequestSecurity {
  nonce: string;
  csp: string;
  responseHeaders: Record<string, string>;
}

export function buildRequestSecurity(input: {
  pathname: string;
  production: boolean;
  supabaseOrigin?: string;
  processorOrigins?: readonly string[];
  /** The embed page: who may frame it. */
  frameAncestors?: readonly string[];
}): RequestSecurity {
  const nonce = randomBase64Url(16);
  const profile = profileForPath(input.pathname);
  const processorOrigins =
    input.processorOrigins ?? (profile === 'payment' ? paymentPageOrigins() : undefined);
  const csp = buildCsp({
    nonce,
    production: input.production,
    profile,
    ...(input.supabaseOrigin ? { supabaseOrigin: input.supabaseOrigin } : {}),
    ...(processorOrigins ? { processorOrigins } : {}),
    ...(input.frameAncestors ? { frameAncestors: input.frameAncestors } : {}),
  });
  return {
    nonce,
    csp,
    responseHeaders: securityHeaders({
      csp,
      trustedTypesReportOnly: buildTrustedTypesPolicy(),
      production: input.production,
      allowFraming: input.pathname.startsWith('/embed/') && (input.frameAncestors?.length ?? 0) > 0,
    }),
  };
}

/** Returns CORS response headers for an allowed origin, or null when the origin is not allowed. */
export function corsHeaders(
  origin: string | null,
  appOrigin: string,
): Record<string, string> | null {
  if (!origin) return null;
  const allowed = origin === appOrigin || CORS_EXTRA_ORIGINS.includes(origin);
  if (!allowed) return null;
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-methods': CORS_ALLOWED_METHODS,
    'access-control-allow-headers': CORS_ALLOWED_HEADERS,
    'access-control-allow-credentials': 'true',
    'access-control-max-age': '600',
    vary: 'Origin',
  };
}
