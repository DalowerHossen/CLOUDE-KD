// path: lib/security/headers.ts
// Response headers set on every response by the proxy.
export interface HeaderInput {
  csp: string;
  trustedTypesReportOnly: string;
  production: boolean;
}

export function securityHeaders(input: HeaderInput): Record<string, string> {
  const headers: Record<string, string> = {
    'content-security-policy': input.csp,
    'content-security-policy-report-only': input.trustedTypesReportOnly,
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'DENY',
    'x-xss-protection': '0',
    'referrer-policy': 'strict-origin-when-cross-origin',
    'permissions-policy':
      'camera=(), microphone=(), geolocation=(), payment=(self), usb=(), interest-cohort=()',
    'cross-origin-opener-policy': 'same-origin',
    'cross-origin-resource-policy': 'same-site',
    'x-dns-prefetch-control': 'off',
    'x-permitted-cross-domain-policies': 'none',
  };
  if (input.production)
    headers['strict-transport-security'] = 'max-age=31536000; includeSubDomains; preload';
  return headers;
}
