// path: services/migration/runner.ts
// The work of the migration wizard, done by the cron job in small batches. A batch of an import reads the next rows of the file,
// checks each, and makes the record through the owning service of the list; every row is written to `migration_rows` (created with
// the id of the record, skipped, or failed with the reason), so a restart continues where it stopped and a rollback knows exactly
// what was made. A rollback removes the records that the job created, a few at a time, through the same owning service; a record
// that is in use (for example a client with invoices) is kept and shown as blocked, and the job ends as partly rolled back.
import 'server-only';
import {
  MIGRATION_BATCH,
  MIGRATION_JOBS_PER_RUN,
  MIGRATION_LOCK_SECONDS,
  ROLLBACK_BATCH,
} from '@/config/s16-migration';
import { AppError, ConflictError, InternalError } from '@/lib/errors';
import { createLogger } from '@/lib/logger';
import { nextBatch, rollbackOpen, windowEnd } from '@/lib/migration/rules';
import { getAdminSupabase } from '@/lib/supabase/admin';
import type { Actor } from '@/types/contracts';
import { loadRows, record, rowOf, toView, type JobRow, type JobView } from './jobs';
import { removeRecord, targetOf } from './ports';

const log = createLogger({ service: 'migration' });

/** The identity used for records the wizard makes: the person who started the job, as ordinary staff. */
function actorFor(companyId: string, userId: string | null): Actor {
  return {
    userId: userId ?? '00000000-0000-0000-0000-000000000000',
    role: 'staff',
    subRole: null,
    companyId,
    email: '',
    sessionId: 'migration-job',
    impersonatedBy: null,
    authenticatedAt: new Date().toISOString(),
    lastStepUpAt: null,
    mfaVerified: false,
  };
}

async function counts(
  jobId: string,
): Promise<{ created: number; skipped: number; failed: number; handled: number }> {
  const admin = getAdminSupabase();
  const one = async (actions: string[]): Promise<number> => {
    const { count, error } = await admin
      .from('migration_rows')
      .select('id', { count: 'exact', head: true })
      .eq('job_id', jobId)
      .in('action', actions);
    if (error) throw new InternalError(error);
    return count ?? 0;
  };
  const created = await one(['created', 'rolled_back', 'rollback_blocked']);
  const skipped = await one(['skipped']);
  const failed = await one(['failed']);
  return { created, skipped, failed, handled: created + skipped + failed };
}

async function finishWriting(
  job: JobRow,
  status: 'committed' | 'failed',
  error: string | null,
): Promise<void> {
  const c = await counts(job.id);
  const now = new Date();
  const r = await getAdminSupabase()
    .from('migration_jobs')
    .update({
      status,
      processed_rows: c.handled,
      created_rows: c.created,
      skipped_rows: c.skipped,
      failed_rows: c.failed,
      error,
      locked_until: null,
      committed_at: status === 'committed' ? now.toISOString() : null,
      rollback_until: windowEnd(now).toISOString(),
    })
    .eq('id', job.id)
    .eq('status', 'running');
  if (r.error) throw new InternalError(r.error);
  await record(
    job.company_id,
    status === 'committed' ? 'migration.committed' : 'migration.failed',
    job.id,
    {
      created: c.created,
      skipped: c.skipped,
      failed: c.failed,
    },
  );
}

/** Works on the next batch of rows of a running import. */
async function importBatch(job: JobRow): Promise<void> {
  const admin = getAdminSupabase();
  const target = targetOf(job.target);
  const actor = actorFor(job.company_id, job.created_by);
  const { rows } = await loadRows(job.company_id, job);
  const done = await counts(job.id);
  const { from, to } = nextBatch(done.handled, rows.length, MIGRATION_BATCH);
  if (from >= rows.length) return finishWriting(job, 'committed', null);
  // Rows already written (a restart in the middle of a batch) are not done again.
  const existing = await admin
    .from('migration_rows')
    .select('row_number')
    .eq('job_id', job.id)
    .gte('row_number', from + 2)
    .lte('row_number', to + 1);
  if (existing.error) throw new InternalError(existing.error);
  const have = new Set((existing.data ?? []).map((r) => Number(r.row_number)));
  for (let i = from; i < to; i += 1) {
    const rowNumber = i + 2;
    if (have.has(rowNumber)) continue;
    const parsed = target.parse(rows[i] ?? {});
    let action: 'created' | 'skipped' | 'failed' = 'failed';
    let recordId: string | null = null;
    let message: string | null = null;
    if (!parsed.ok) message = parsed.errors.join(' ').slice(0, 300);
    else {
      try {
        const dup = await target.findDuplicate(job.company_id, parsed.value);
        if (dup !== null && job.duplicate_mode === 'skip') {
          action = 'skipped';
          message = 'A record like this exists already.';
        } else {
          recordId = await target.create(actor, parsed.value);
          action = 'created';
        }
      } catch (e) {
        message = e instanceof AppError ? e.message.slice(0, 300) : 'The row could not be saved.';
        if (!(e instanceof AppError))
          log.warn('migration row failed', { jobId: job.id, row: rowNumber, error: e });
      }
    }
    const ins = await admin.from('migration_rows').insert({
      company_id: job.company_id,
      job_id: job.id,
      row_number: rowNumber,
      action,
      record_id: recordId,
      message,
    });
    if (ins.error) throw new InternalError(ins.error);
  }
  const c = await counts(job.id);
  const save = await admin
    .from('migration_jobs')
    .update({
      processed_rows: c.handled,
      created_rows: c.created,
      skipped_rows: c.skipped,
      failed_rows: c.failed,
      locked_until: null,
    })
    .eq('id', job.id)
    .eq('status', 'running')
    .select('id');
  if (save.error) throw new InternalError(save.error);
  if ((save.data ?? []).length === 0) return; // cancelled while running
  if (c.handled >= rows.length) await finishWriting(job, 'committed', null);
}

/** Removes the next records that the job created. */
async function rollbackBatch(job: JobRow): Promise<void> {
  const admin = getAdminSupabase();
  const actor = actorFor(job.company_id, job.created_by);
  const { data, error } = await admin
    .from('migration_rows')
    .select('id, record_id')
    .eq('job_id', job.id)
    .eq('action', 'created')
    .order('row_number', { ascending: true })
    .limit(ROLLBACK_BATCH);
  if (error) throw new InternalError(error);
  for (const r of data ?? []) {
    let action: 'rolled_back' | 'rollback_blocked' = 'rolled_back';
    let message: string | null = null;
    try {
      await removeRecord(actor, job.target, String(r.record_id));
    } catch (e) {
      // A record that is gone already counts as rolled back; one that is in use is kept.
      const gone = e instanceof AppError && e.status === 404;
      if (!gone) {
        action = 'rollback_blocked';
        message =
          e instanceof AppError ? e.message.slice(0, 300) : 'The record could not be removed.';
        if (!(e instanceof AppError)) log.warn('rollback failed', { jobId: job.id, error: e });
      }
    }
    const upd = await admin
      .from('migration_rows')
      .update({ action, message })
      .eq('id', String(r.id))
      .eq('action', 'created');
    if (upd.error) throw new InternalError(upd.error);
  }
  const left = await admin
    .from('migration_rows')
    .select('id', { count: 'exact', head: true })
    .eq('job_id', job.id)
    .eq('action', 'created');
  if (left.error) throw new InternalError(left.error);
  if ((left.count ?? 0) > 0) {
    await admin
      .from('migration_jobs')
      .update({ locked_until: null })
      .eq('id', job.id)
      .eq('status', 'rolling_back');
    return;
  }
  const blocked = await admin
    .from('migration_rows')
    .select('id', { count: 'exact', head: true })
    .eq('job_id', job.id)
    .eq('action', 'rollback_blocked');
  if (blocked.error) throw new InternalError(blocked.error);
  const status = (blocked.count ?? 0) > 0 ? 'rollback_partial' : 'rolled_back';
  const fin = await admin
    .from('migration_jobs')
    .update({ status, rolled_back_at: new Date().toISOString(), locked_until: null })
    .eq('id', job.id)
    .eq('status', 'rolling_back');
  if (fin.error) throw new InternalError(fin.error);
  await record(job.company_id, 'migration.rolled_back', job.id, {
    status,
    blocked: blocked.count ?? 0,
  });
}

/** Cron, every minute: one batch for each job that has work. */
export async function runMigrations(): Promise<{ jobs: number }> {
  const { data, error } = await getAdminSupabase().rpc('kd_claim_migration_jobs', {
    p_limit: MIGRATION_JOBS_PER_RUN,
    p_lock_seconds: MIGRATION_LOCK_SECONDS,
  });
  if (error) throw new InternalError(error);
  const jobs = (data ?? []) as JobRow[];
  for (const job of jobs) {
    try {
      if (job.status === 'rolling_back') await rollbackBatch(job);
      else await importBatch(job);
    } catch (e) {
      log.error('migration job crashed', { jobId: job.id, error: e });
      if (job.status === 'running')
        await finishWriting(
          job,
          'failed',
          'The import stopped because of an error. The records made so far can be rolled back.',
        ).catch(() => undefined);
    }
  }
  return { jobs: jobs.length };
}

/** The owner rolls back a finished, failed, cancelled or partly rolled back job inside the 24 hour window. */
export async function startRollback(actor: Actor, id: string): Promise<JobView> {
  if (!actor.companyId) throw new ConflictError('A company is needed.');
  const companyId = actor.companyId;
  const job = await rowOf(companyId, id);
  if (!['committed', 'failed', 'cancelled', 'rollback_partial'].includes(job.status))
    throw new ConflictError('Only an import that wrote records can be rolled back.');
  if (!rollbackOpen({ rollbackUntil: job.rollback_until }, new Date()))
    throw new ConflictError('The rollback window of 24 hours is over.');
  const admin = getAdminSupabase();
  if (job.status === 'rollback_partial') {
    // Records that were in use are tried again.
    const again = await admin
      .from('migration_rows')
      .update({ action: 'created', message: null })
      .eq('job_id', id)
      .eq('action', 'rollback_blocked');
    if (again.error) throw new InternalError(again.error);
  }
  const { data, error } = await admin
    .from('migration_jobs')
    .update({ status: 'rolling_back', locked_until: null })
    .eq('company_id', companyId)
    .eq('id', id)
    .eq('version', job.version)
    .eq('status', job.status)
    .select('id');
  if (error) throw new InternalError(error);
  if ((data ?? []).length === 0)
    throw new ConflictError('The import changed. Reload and try again.');
  await record(companyId, 'migration.rollback_started', id, { created: job.created_rows });
  return toView(await rowOf(companyId, id));
}
