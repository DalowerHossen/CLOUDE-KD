// path: services/security/rate-limit.ts
// Supabase table limiter, per-address bans for abusers and the rateLimit entry of the security contract.
import 'server-only';
import { z } from 'zod';
import { BAN_AFTER_DENIALS, BAN_SECONDS, BAN_WINDOW_SECONDS } from '@/config/security';
import { policyFor, type RateLimitAdapter } from '@/lib/middleware/rate-limit';
import { InternalError } from '@/lib/errors';
import { createLogger } from '@/lib/logger';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { readRequestMeta } from '@/services/audit/request-meta';
import type { RateLimitResult } from '@/types/contracts';
import { raiseEvent } from './events';

const log = createLogger({ component: 'rate-limit' });
const hitSchema = z
  .object({
    allowed: z.boolean(),
    remaining: z.number().int(),
    retryAfterSeconds: z.number().int(),
  })
  .strip();

export const supabaseRateLimitAdapter: RateLimitAdapter = {
  async hit(key, policy) {
    const { data, error } = await getAdminSupabase().rpc('kd_rate_limit_hit', {
      p_key: key,
      p_limit: policy.limit,
      p_window_seconds: policy.windowSeconds,
    });
    if (error) throw new InternalError(error);
    return hitSchema.parse(data);
  },
};

let adapter: RateLimitAdapter = supabaseRateLimitAdapter;

/** Replaces the limiter (for example by a Redis adapter). */
export function setRateLimitAdapter(next: RateLimitAdapter): void {
  adapter = next;
}

export async function isIpBlocked(ipHash: string): Promise<boolean> {
  const { data, error } = await getAdminSupabase().rpc('kd_ip_is_blocked', { p_ip_hash: ipHash });
  if (error) throw new InternalError(error);
  return data === true;
}

export async function banIp(
  ipHash: string,
  ipMasked: string | null,
  reason: string,
  seconds: number,
  by: string | null = null,
): Promise<void> {
  const { error } = await getAdminSupabase().rpc('kd_ip_block', {
    p_ip_hash: ipHash,
    p_ip_masked: ipMasked,
    p_reason: reason,
    p_seconds: seconds,
    p_permanent: false,
    p_by: by,
  });
  if (error) throw new InternalError(error);
}

/**
 * Fixed-window limit for `key` under the named policy. A banned address is refused at once. An address that keeps
 * hitting the limit is banned for BAN_SECONDS. If the limiter itself fails the request is refused (fail closed).
 */
export async function rateLimit(key: string, policyName: string): Promise<RateLimitResult> {
  const policy = policyFor(policyName);
  try {
    const meta = await readRequestMeta();
    if (meta.ipHash && (await isIpBlocked(meta.ipHash))) {
      return { allowed: false, remaining: 0, retryAfterSeconds: BAN_SECONDS };
    }
    const result = await adapter.hit(`${policyName}:${key}`, policy);
    if (!result.allowed && meta.ipHash) {
      const denials = await adapter.hit(`deny:${meta.ipHash}`, {
        limit: BAN_AFTER_DENIALS,
        windowSeconds: BAN_WINDOW_SECONDS,
      });
      if (!denials.allowed) {
        await banIp(meta.ipHash, meta.ipMasked, 'repeated rate limit violations', BAN_SECONDS);
        await raiseEvent('brute_force', {
          reason: 'ip_banned_after_rate_limit',
          policy: policyName,
        });
      }
    }
    return result;
  } catch (error) {
    log.error('rate limiter failed; refusing the request', { error });
    return { allowed: false, remaining: 0, retryAfterSeconds: 30 };
  }
}
