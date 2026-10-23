// path: services/publicapi/usage.ts
// The per-minute counter (rate limit) and the per-day usage of a key, the last-used mark, and the usage anomaly check.
import 'server-only';
import { ANOMALY_HISTORY_DAYS, ANOMALY_MIN_REQUESTS } from '@/config/s16-api';
import { getService } from '@/lib/container';
import { InternalError } from '@/lib/errors';
import {
  isUsageAnomaly,
  rateState,
  windowStart,
  type RateState,
} from '@/lib/integrations/api-key-rules';
import { createLogger } from '@/lib/logger';
import { getAdminSupabase } from '@/lib/supabase/admin';
import type { KeyAuth } from './keys';

const log = createLogger({ service: 'publicapi-usage' });
const MARK_EVERY_MS = 60_000;

/** Counts this request in the current minute and says whether the key is still inside its limit. */
export async function hitKey(key: KeyAuth, now: Date): Promise<RateState> {
  const { data, error } = await getAdminSupabase().rpc('kd_api_key_hit', {
    p_key: key.id,
    p_company: key.companyId,
    p_window: windowStart(now),
  });
  if (error) throw new InternalError(error);
  return rateState(Number(data), key.rateLimitPerMinute, now);
}

const dayOf = (d: Date): string => d.toISOString().slice(0, 10);

/**
 * Records the request of the day and the last-used mark (at most once a minute), and raises a security event when the day is far
 * above the average of the days before. Failures are logged and never break the answer.
 */
export async function recordUsage(
  key: KeyAuth,
  ip: string,
  failed: boolean,
  now: Date,
): Promise<void> {
  try {
    const admin = getAdminSupabase();
    const { data, error } = await admin.rpc('kd_api_key_usage_add', {
      p_key: key.id,
      p_company: key.companyId,
      p_day: dayOf(now),
      p_error: failed,
    });
    if (error) throw error;
    const today = Number(data);
    if (key.lastUsedAt === null || now.getTime() - Date.parse(key.lastUsedAt) > MARK_EVERY_MS) {
      await admin
        .from('api_keys')
        .update({ last_used_at: now.toISOString(), last_used_ip: ip.slice(0, 64) })
        .eq('id', key.id);
    }
    if (today % ANOMALY_MIN_REQUESTS === 0) {
      const from = new Date(now.getTime() - ANOMALY_HISTORY_DAYS * 86_400_000);
      const rows = await admin
        .from('api_key_usage')
        .select('day, requests')
        .eq('key_id', key.id)
        .gte('day', dayOf(from))
        .lt('day', dayOf(now));
      if (rows.error) throw rows.error;
      const byDay = new Map((rows.data ?? []).map((r) => [String(r.day), Number(r.requests)]));
      const previous = Array.from(
        { length: ANOMALY_HISTORY_DAYS },
        (_, i) => byDay.get(dayOf(new Date(now.getTime() - (i + 1) * 86_400_000))) ?? 0,
      );
      if (isUsageAnomaly(today, previous)) {
        await getService('security').raiseSecurityEvent('other', {
          reason: 'api_usage_anomaly',
          keyId: key.id,
          companyId: key.companyId,
          requestsToday: today,
        });
      }
    }
  } catch (error) {
    log.warn('usage record failed', { error });
  }
}

export interface UsageDay {
  day: string;
  requests: number;
  errors: number;
}

/** The last days of usage of one key (newest first). */
export async function usageOfKey(
  companyId: string,
  keyId: string,
  days: number,
): Promise<UsageDay[]> {
  const { data, error } = await getAdminSupabase()
    .from('api_key_usage')
    .select('day, requests, errors')
    .eq('company_id', companyId)
    .eq('key_id', keyId)
    .order('day', { ascending: false })
    .limit(Math.min(Math.max(days, 1), 90));
  if (error) throw new InternalError(error);
  return (data ?? []).map((r) => ({
    day: String(r.day),
    requests: Number(r.requests),
    errors: Number(r.errors),
  }));
}
