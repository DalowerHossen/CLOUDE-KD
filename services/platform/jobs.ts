// path: services/platform/jobs.ts
// The job queue as the super admin sees it: counts per state, the oldest waiting job, the jobs that failed or were given up
// (with the error text), and a retry that puts one back in the queue.
import 'server-only';
import { getService } from '@/lib/container';
import { ForbiddenError, InternalError, NotFoundError } from '@/lib/errors';
import { getAdminSupabase } from '@/lib/supabase/admin';
import type { Actor } from '@/types/contracts';

const STATES = ['pending', 'processing', 'done', 'failed', 'dead'] as const;
export type JobState = (typeof STATES)[number];

export interface JobRow {
  id: string;
  name: string;
  status: JobState;
  attempts: number;
  maxAttempts: number;
  runAt: string;
  lastError: string;
  companyId: string | null;
}

export interface JobSummary {
  counts: Record<JobState, number>;
  oldestPendingMinutes: number | null;
  problems: JobRow[];
}

export async function jobSummary(): Promise<JobSummary> {
  const admin = getAdminSupabase();
  const counts = Object.fromEntries(STATES.map((s) => [s, 0])) as Record<JobState, number>;
  const results = await Promise.all(
    STATES.map((s) =>
      admin
        .from('job_queue')
        .select('id', { count: 'exact', head: true })
        .eq('status', s)
        .is('deleted_at', null),
    ),
  );
  STATES.forEach((s, i) => {
    const r = results[i];
    if (!r || r.error) throw new InternalError(r?.error);
    counts[s] = r.count ?? 0;
  });
  const oldest = await admin
    .from('job_queue')
    .select('run_at')
    .eq('status', 'pending')
    .is('deleted_at', null)
    .lte('run_at', new Date().toISOString())
    .order('run_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (oldest.error) throw new InternalError(oldest.error);
  const problems = await admin
    .from('job_queue')
    .select('id, name, status, attempts, max_attempts, run_at, last_error, company_id')
    .in('status', ['failed', 'dead'])
    .is('deleted_at', null)
    .order('updated_at', { ascending: false })
    .limit(50);
  if (problems.error) throw new InternalError(problems.error);
  return {
    counts,
    oldestPendingMinutes: oldest.data
      ? Math.max(0, Math.round((Date.now() - Date.parse(String(oldest.data.run_at))) / 60_000))
      : null,
    problems: (problems.data ?? []).map((r) => ({
      id: String(r.id),
      name: String(r.name),
      status: String(r.status) as JobState,
      attempts: Number(r.attempts),
      maxAttempts: Number(r.max_attempts),
      runAt: String(r.run_at),
      lastError: String(r.last_error ?? '').slice(0, 300),
      companyId: r.company_id ? String(r.company_id) : null,
    })),
  };
}

/** Puts a failed or given-up job back in the queue with a fresh attempt count. */
export async function retryJob(actor: Actor, id: string): Promise<void> {
  if (actor.role !== 'super_admin') throw new ForbiddenError();
  const r = await getAdminSupabase()
    .from('job_queue')
    .update({
      status: 'pending',
      attempts: 0,
      run_at: new Date().toISOString(),
      locked_until: null,
      locked_by: null,
      finished_at: null,
    })
    .eq('id', id)
    .in('status', ['failed', 'dead'])
    .is('deleted_at', null)
    .select('id, name, company_id');
  if (r.error) throw new InternalError(r.error);
  const row = r.data?.[0];
  if (!row) throw new NotFoundError();
  await getService('audit').record({
    action: 'platform.job_retried',
    resourceType: 'job',
    resourceId: id,
    companyId: row.company_id ? String(row.company_id) : null,
    metadata: { name: String(row.name), by: actor.userId },
  });
}
