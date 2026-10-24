// path: lib/middleware/rate-limit.ts
// Rate limit types and helpers. The limiter sits behind an adapter so the Supabase table can be replaced by Redis later.
import { RATE_POLICIES, type RatePolicy } from '@/config/security';
import type { RateLimitResult } from '@/types/contracts';

export interface RateLimitAdapter {
  /** Counts one hit for the key inside the policy window and says whether it is allowed. Must be atomic. */
  hit(key: string, policy: RatePolicy): Promise<RateLimitResult>;
}

export function policyFor(name: string): RatePolicy {
  return RATE_POLICIES[name] ?? RATE_POLICIES['api-default'] ?? { limit: 120, windowSeconds: 60 };
}

/** Standard headers of a limited response. */
export function rateLimitHeaders(
  result: RateLimitResult,
  policy: RatePolicy,
): Record<string, string> {
  const headers: Record<string, string> = {
    'x-ratelimit-limit': String(policy.limit),
    'x-ratelimit-remaining': String(Math.max(result.remaining, 0)),
  };
  if (!result.allowed) headers['retry-after'] = String(Math.max(result.retryAfterSeconds, 1));
  return headers;
}
