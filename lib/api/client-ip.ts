// path: lib/api/client-ip.ts

const IPV4 = /^(?:\d{1,3}\.){3}\d{1,3}$/;
const IPV6 = /^[0-9a-fA-F:]+$/;

function valid(value: string | null): string | null {
  if (!value) return null;
  const candidate = value.trim();
  if (IPV4.test(candidate) || (candidate.includes(':') && IPV6.test(candidate))) return candidate;
  return null;
}

/**
 * Client address behind Cloudflare. cf-connecting-ip is set by Cloudflare and preferred;
 * other headers are used only when it is absent (local development, Docker behind nginx).
 */
export function getClientIp(headers: Headers): string {
  return (
    valid(headers.get('cf-connecting-ip')) ??
    valid(headers.get('x-real-ip')) ??
    valid((headers.get('x-forwarded-for') ?? '').split(',')[0] ?? null) ??
    '0.0.0.0'
  );
}
