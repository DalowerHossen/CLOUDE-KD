// path: lib/security/csp.ts
// Content security policy builder. Scripts need the per-request nonce; there is no 'unsafe-inline' for scripts.
import { TURNSTILE_ORIGIN, type CspProfile } from '@/config/security';

export interface CspInput {
  nonce: string;
  profile?: CspProfile;
  /** Origin of the Supabase project (https://xxxx.supabase.co). Adds https and wss connect sources. */
  supabaseOrigin?: string;
  /** Payment profile only: the processor's script, frame and API origins. */
  processorOrigins?: readonly string[];
  /** Embed page only: the web sites that may show this page in a frame. Without it nobody may. */
  frameAncestors?: readonly string[];
  production: boolean;
  reportUri?: string;
}

function originOf(value: string): string | null {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url.origin : null;
  } catch {
    return null;
  }
}

export function buildCsp(input: CspInput): string {
  const profile = input.profile ?? 'default';
  const supabase = input.supabaseOrigin ? originOf(input.supabaseOrigin) : null;
  const processors = (input.processorOrigins ?? [])
    .map(originOf)
    .filter((o): o is string => o !== null);
  const nonce = `'nonce-${input.nonce}'`;
  const ancestors = (input.frameAncestors ?? []).filter((o) =>
    /^https?:\/\/[A-Za-z0-9.:-]+$/.test(o),
  );

  const connect = ["'self'"];
  if (supabase) connect.push(supabase, supabase.replace('https://', 'wss://'));
  const frames: string[] = [TURNSTILE_ORIGIN];
  const scripts = ["'self'", nonce, "'strict-dynamic'"];

  if (profile === 'payment') {
    // Only the processor may run code or be framed on a payment page; the Turnstile widget is not needed there.
    frames.length = 0;
    frames.push(...processors);
    scripts.push(...processors);
    connect.push(...processors);
  } else {
    scripts.push(TURNSTILE_ORIGIN);
  }
  if (!input.production) scripts.push("'unsafe-eval'"); // React development tooling only

  const directives: [string, readonly string[]][] = [
    ['default-src', ["'self'"]],
    ['script-src', scripts],
    ['script-src-attr', ["'none'"]],
    ['style-src', ["'self'", nonce]],
    ['style-src-attr', ["'unsafe-inline'"]],
    ['img-src', ["'self'", 'data:', 'blob:']],
    ['font-src', ["'self'"]],
    ['connect-src', connect],
    ['frame-src', frames.length > 0 ? frames : ["'none'"]],
    ['frame-ancestors', ancestors.length > 0 ? ancestors : ["'none'"]],
    ['base-uri', ["'self'"]],
    ['form-action', ["'self'"]],
    ['object-src', ["'none'"]],
    ['manifest-src', ["'self'"]],
    ['worker-src', ["'self'", 'blob:']],
  ];
  const parts = directives.map(([name, values]) => `${name} ${values.join(' ')}`);
  if (input.production) parts.push('upgrade-insecure-requests');
  if (input.reportUri) parts.push(`report-uri ${input.reportUri}`);
  return parts.join('; ');
}

/** Trusted Types are reported first (report-only header) so the Turnstile loader and DOMPurify can be checked in real use. */
export function buildTrustedTypesPolicy(reportUri?: string): string {
  const parts = [
    "require-trusted-types-for 'script'",
    'trusted-types nextjs nextjs#bundler dompurify default',
  ];
  if (reportUri) parts.push(`report-uri ${reportUri}`);
  return parts.join('; ');
}

/** Pages that take card details or payment confirmations use the strict payment profile. */
export function profileForPath(pathname: string): CspProfile {
  return pathname.startsWith('/pay/') ||
    pathname.startsWith('/portal/pay') ||
    pathname.startsWith('/embed/')
    ? 'payment'
    : 'default';
}
