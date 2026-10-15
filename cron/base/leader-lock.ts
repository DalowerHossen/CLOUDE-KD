// path: cron/base/leader-lock.ts
// Leader lock for cron jobs: when two instances fire the same job, only one runs it. Uses a short lease.
import 'server-only';
import { ConflictError } from '@/lib/errors';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { withLease } from '@/services/base/pessimistic-lock';

export interface LeaderResult<T> {
  ran: boolean;
  value: T | null;
}

export async function withLeaderLock<T>(
  jobName: string,
  fn: () => Promise<T>,
  ttlSeconds = 300,
): Promise<LeaderResult<T>> {
  try {
    const value = await withLease(getAdminSupabase(), `cron:${jobName}`, fn, {
      ttlSeconds,
      waitMs: 0,
    });
    return { ran: true, value };
  } catch (error) {
    if (error instanceof ConflictError) return { ran: false, value: null };
    throw error;
  }
}
