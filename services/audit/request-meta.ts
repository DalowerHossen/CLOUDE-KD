// path: services/audit/request-meta.ts
// Request metadata for audit entries: masked address, keyed address hash and user-agent hash. No raw PII is stored.
import 'server-only';
import { headers } from 'next/headers';
import { getClientIp } from '@/lib/api/client-ip';
import { getServerEnv } from '@/lib/env';
import { hmacSha256Hex } from '@/lib/utils/hash';
import { maskIp } from './mask-ip';

export interface AuditRequestMeta {
  ipMasked: string | null;
  ipHash: string | null;
  userAgentHash: string | null;
}

/** Keyed hash of an address, the same value that audit entries and security events store. */
export async function hashIp(ip: string): Promise<string> {
  return hmacSha256Hex(getServerEnv().HMAC_TOKEN_SECRET, `ip:${ip}`);
}

/** Returns empty metadata outside a request (cron jobs and workers). */
export async function readRequestMeta(): Promise<AuditRequestMeta> {
  let source: Headers;
  try {
    source = await headers();
  } catch {
    return { ipMasked: null, ipHash: null, userAgentHash: null };
  }
  const key = getServerEnv().HMAC_TOKEN_SECRET;
  const ip = getClientIp(source);
  const userAgent = source.get('user-agent')?.slice(0, 500) ?? null;
  return {
    ipMasked: ip === '0.0.0.0' ? null : maskIp(ip),
    ipHash: ip === '0.0.0.0' ? null : await hmacSha256Hex(key, `ip:${ip}`),
    userAgentHash: userAgent === null ? null : await hmacSha256Hex(key, `ua:${userAgent}`),
  };
}
