// path: services/integration/housekeeping.ts
// Daily housekeeping of the integrations. Every step can be run again without harm: a key is noticed once, old counters are
// removed by date, and an import that was never started is cancelled by its state.
//   - API keys that expire within 7 days: the company is told once (the time is kept on the key).
//   - The rate limit counters of past days (one row per key and minute) are removed; the usage per day is kept for 400 days.
//   - An import file that was uploaded or checked and then left for 7 days is cancelled (nothing was written for it).
import 'server-only';
import { getService } from '@/lib/container';
import { InternalError } from '@/lib/errors';
import { createLogger } from '@/lib/logger';
import { getAdminSupabase } from '@/lib/supabase/admin';

const log = createLogger({ service: 'integration-housekeeping' });
export const KEY_NOTICE_DAYS = 7;
export const WINDOW_KEEP_DAYS = 2;
export const USAGE_KEEP_DAYS = 400;
export const MIGRATION_IDLE_DAYS = 7;

const daysAgo = (n: number): Date => new Date(Date.now() - n * 86_400_000);

/** Tells each company once about keys that expire within the next days. */
export async function noticeExpiringKeys(): Promise<{ noticed: number }> {
  const admin = getAdminSupabase();
  const { data, error } = await admin
    .from('api_keys')
    .select('id, company_id, name, expires_at')
    .is('revoked_at', null)
    .is('deleted_at', null)
    .is('expiry_notice_at', null)
    .not('expires_at', 'is', null)
    .gt('expires_at', new Date().toISOString())
    .lt('expires_at', new Date(Date.now() + KEY_NOTICE_DAYS * 86_400_000).toISOString())
    .limit(200);
  if (error) throw new InternalError(error);
  let noticed = 0;
  for (const k of data ?? []) {
    // The mark is set first, so two runs never tell the same company twice.
    const mark = await admin
      .from('api_keys')
      .update({ expiry_notice_at: new Date().toISOString() })
      .eq('id', String(k.id))
      .is('expiry_notice_at', null)
      .select('id');
    if (mark.error) throw new InternalError(mark.error);
    if ((mark.data ?? []).length === 0) continue;
    try {
      await getService('notification').notify({
        companyId: String(k.company_id),
        type: 'api_key.expiring',
        title: 'An API key is about to expire',
        body: `The key "${String(k.name)}" stops working on ${String(k.expires_at).slice(0, 10)}. Make a new key (or rotate this one) and update what uses it.`,
        href: '/developers',
      });
      noticed += 1;
    } catch (e) {
      log.error('key notice failed', { keyId: String(k.id), error: e });
      await admin.from('api_keys').update({ expiry_notice_at: null }).eq('id', String(k.id));
    }
  }
  return { noticed };
}

/** Removes old rate limit counters and old daily usage. */
export async function trimUsage(): Promise<{ windows: number; days: number }> {
  const admin = getAdminSupabase();
  const windows = await admin
    .from('api_key_windows')
    .delete({ count: 'exact' })
    .lt('window_start', daysAgo(WINDOW_KEEP_DAYS).toISOString());
  if (windows.error) throw new InternalError(windows.error);
  const days = await admin
    .from('api_key_usage')
    .delete({ count: 'exact' })
    .lt('day', daysAgo(USAGE_KEEP_DAYS).toISOString().slice(0, 10));
  if (days.error) throw new InternalError(days.error);
  return { windows: windows.count ?? 0, days: days.count ?? 0 };
}

/** Cancels imports that were uploaded or checked and never started. */
export async function cancelIdleImports(): Promise<{ cancelled: number }> {
  const { data, error } = await getAdminSupabase()
    .from('migration_jobs')
    .update({ status: 'cancelled' })
    .in('status', ['uploaded', 'validated'])
    .lt('updated_at', daysAgo(MIGRATION_IDLE_DAYS).toISOString())
    .is('deleted_at', null)
    .select('id');
  if (error) throw new InternalError(error);
  return { cancelled: (data ?? []).length };
}

export async function runHousekeeping(): Promise<void> {
  for (const step of [noticeExpiringKeys, trimUsage, cancelIdleImports]) {
    try {
      await step();
    } catch (e) {
      log.error('housekeeping step failed', { step: step.name, error: e });
    }
  }
}
