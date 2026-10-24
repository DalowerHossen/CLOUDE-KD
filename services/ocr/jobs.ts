// path: services/ocr/jobs.ts
// The OCR queue. A receipt that waits for reading (status pending in the expense service) becomes a job; the cron job takes due
// jobs, reads the image with Google Cloud Vision, finds vendor, date, total and tax with a confidence for each, and hands the
// fields to the expense service. A temporary failure is tried again (three tries in all); a final failure tells the expense
// service `null` exactly once. The owner can correct the fields (the corrected fields go to the expense service again) and
// can read a receipt again. A company reads at most its daily limit of receipts in 24 hours.
import 'server-only';
import {
  OCR_BATCH,
  OCR_ENQUEUE_BATCH,
  OCR_LOCK_SECONDS,
  OCR_MAX_ATTEMPTS,
  OCR_RETRY_MINUTES,
} from '@/config/s16-ocr';
import { getService } from '@/lib/container';
import { ConflictError, InternalError, NotFoundError, ValidationError } from '@/lib/errors';
import { createLogger } from '@/lib/logger';
import { extractReceipt, type OcrField } from '@/lib/ocr/extract-rules';
import { correctionInput } from '@/lib/ocr/rules';
import { OcrApiError, readImage } from '@/lib/ocr/vision';
import { getAdminSupabase } from '@/lib/supabase/admin';
import type { Actor } from '@/types/contracts';
import { mapIntegrationError } from '@/services/publicapi/db-errors';
import { keyOf } from './settings';
import { reportToExpenses, type ReadFields } from './ports';

const log = createLogger({ service: 'ocr-jobs' });

export interface JobView {
  id: string;
  receiptId: string;
  receiptName: string;
  mimeType: string;
  status: 'queued' | 'processing' | 'done' | 'failed';
  attempts: number;
  fields: ReadFields;
  confidence: Partial<Record<OcrField, number>>;
  error: string | null;
  corrected: boolean;
  finishedAt: string | null;
  createdAt: string;
  version: number;
}

const COLUMNS =
  'id, receipt_id, status, attempts, fields, confidence, error, corrected_at, finished_at, created_at, version, receipts(name, mime_type)';

interface Row {
  id: string;
  receipt_id: string;
  status: string;
  attempts: number;
  fields: ReadFields;
  confidence: Partial<Record<OcrField, number>>;
  error: string | null;
  corrected_at: string | null;
  finished_at: string | null;
  created_at: string;
  version: number;
  receipts: { name: string; mime_type: string } | { name: string; mime_type: string }[] | null;
}

const STATES = ['queued', 'processing', 'done', 'failed'] as const;
const toView = (r: Row): JobView => {
  const rec = Array.isArray(r.receipts) ? r.receipts[0] : r.receipts;
  return {
    id: r.id,
    receiptId: r.receipt_id,
    receiptName: rec?.name ?? '',
    mimeType: rec?.mime_type ?? '',
    status: STATES.find((s) => s === r.status) ?? 'queued',
    attempts: r.attempts,
    fields: r.fields ?? {},
    confidence: r.confidence ?? {},
    error: r.error,
    corrected: r.corrected_at !== null,
    finishedAt: r.finished_at,
    createdAt: r.created_at,
    version: r.version,
  };
};

async function record(
  companyId: string,
  action: string,
  id: string,
  metadata: Record<string, unknown>,
): Promise<void> {
  await getService('audit').record({
    action,
    resourceType: 'ocr_job',
    resourceId: id,
    companyId,
    metadata,
  });
}

export async function listJobs(companyId: string, limit = 50): Promise<JobView[]> {
  const { data, error } = await getAdminSupabase()
    .from('ocr_jobs')
    .select(COLUMNS)
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .order('id', { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 200));
  if (error) throw new InternalError(error);
  return ((data ?? []) as unknown as Row[]).map(toView);
}

async function rowOf(companyId: string, id: string): Promise<Row> {
  const { data, error } = await getAdminSupabase()
    .from('ocr_jobs')
    .select(COLUMNS)
    .eq('company_id', companyId)
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw new InternalError(error);
  if (!data) throw new NotFoundError();
  return data as unknown as Row;
}

/* ---------- queueing ---------- */

/** Puts one receipt in the queue (or returns its job when it is there already). */
export async function enqueueReceipt(actor: Actor, receiptId: string): Promise<JobView> {
  const companyId = actor.companyId;
  if (!companyId) throw new ValidationError('A company is needed.');
  if ((await keyOf(companyId)) === null)
    throw new ConflictError('Switch OCR on and add the Google API key first.');
  const admin = getAdminSupabase();
  const { data, error } = await admin
    .from('ocr_jobs')
    .insert({ company_id: companyId, receipt_id: receiptId, created_by: actor.userId })
    .select('id')
    .single();
  if (error) {
    if (error.code === '23505') {
      const existing = await admin
        .from('ocr_jobs')
        .select('id')
        .eq('receipt_id', receiptId)
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .maybeSingle();
      if (existing.data) return toView(await rowOf(companyId, String(existing.data.id)));
    }
    mapIntegrationError(error);
  }
  const id = String(data?.id);
  await record(companyId, 'ocr.job_queued', id, { receiptId });
  return toView(await rowOf(companyId, id));
}

/** Cron: every receipt that waits for reading in a company with OCR on gets a job. */
export async function enqueuePending(): Promise<{ queued: number }> {
  const admin = getAdminSupabase();
  const on = await admin
    .from('ocr_settings')
    .select('company_id')
    .eq('enabled', true)
    .is('deleted_at', null)
    .limit(1000);
  if (on.error) throw new InternalError(on.error);
  let queued = 0;
  for (const c of on.data ?? []) {
    const companyId = String(c.company_id);
    const waiting = await admin
      .from('receipts')
      .select('id')
      .eq('company_id', companyId)
      .eq('ocr_status', 'pending')
      .is('deleted_at', null)
      .order('id', { ascending: true })
      .limit(OCR_ENQUEUE_BATCH * 3);
    if (waiting.error) throw new InternalError(waiting.error);
    const ids = (waiting.data ?? []).map((r) => String(r.id));
    if (ids.length === 0) continue;
    const have = await admin
      .from('ocr_jobs')
      .select('receipt_id')
      .in('receipt_id', ids)
      .is('deleted_at', null);
    if (have.error) throw new InternalError(have.error);
    const taken = new Set((have.data ?? []).map((h) => String(h.receipt_id)));
    for (const receiptId of ids.filter((i) => !taken.has(i)).slice(0, OCR_ENQUEUE_BATCH)) {
      const r = await admin
        .from('ocr_jobs')
        .insert({ company_id: companyId, receipt_id: receiptId });
      if (r.error && r.error.code !== '23505') throw new InternalError(r.error);
      if (!r.error) queued += 1;
    }
  }
  return { queued };
}

/* ---------- reading ---------- */

interface Claimed {
  id: string;
  company_id: string;
  receipt_id: string;
  attempts: number;
}

async function readsInLastDay(companyId: string): Promise<number> {
  const { count, error } = await getAdminSupabase()
    .from('ocr_jobs')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', companyId)
    .gt('started_at', new Date(Date.now() - 86_400_000).toISOString());
  if (error) throw new InternalError(error);
  return count ?? 0;
}

/** Tells the expense service `null` once for a job that failed for good. */
async function reportFailure(job: Claimed): Promise<void> {
  const admin = getAdminSupabase();
  const claim = await admin
    .from('ocr_jobs')
    .update({ failure_reported: true })
    .eq('id', job.id)
    .eq('failure_reported', false)
    .select('id');
  if (claim.error) throw new InternalError(claim.error);
  if ((claim.data ?? []).length === 0) return;
  try {
    await reportToExpenses(job.company_id, job.receipt_id, null);
  } catch (e) {
    // Not told: allow another try.
    await admin.from('ocr_jobs').update({ failure_reported: false }).eq('id', job.id);
    throw e;
  }
}

async function failJob(job: Claimed, message: string, retryable: boolean): Promise<void> {
  const admin = getAdminSupabase();
  if (retryable && job.attempts < OCR_MAX_ATTEMPTS) {
    const wait = OCR_RETRY_MINUTES[Math.min(job.attempts, OCR_RETRY_MINUTES.length) - 1] ?? 10;
    const r = await admin
      .from('ocr_jobs')
      .update({
        status: 'queued',
        error: message.slice(0, 300),
        locked_until: null,
        next_attempt_at: new Date(Date.now() + wait * 60_000).toISOString(),
      })
      .eq('id', job.id);
    if (r.error) throw new InternalError(r.error);
    return;
  }
  const r = await admin
    .from('ocr_jobs')
    .update({
      status: 'failed',
      error: message.slice(0, 300),
      locked_until: null,
      finished_at: new Date().toISOString(),
    })
    .eq('id', job.id);
  if (r.error) throw new InternalError(r.error);
  await reportFailure(job);
}

async function processOne(job: Claimed): Promise<'done' | 'failed' | 'retry' | 'later'> {
  const admin = getAdminSupabase();
  const settings = await keyOf(job.company_id);
  if (settings === null) {
    await failJob(job, 'OCR is switched off or has no API key.', false);
    return 'failed';
  }
  if ((await readsInLastDay(job.company_id)) > settings.dailyLimit) {
    // Over the daily limit: wait an hour. This is not a try, so the count goes back.
    await admin
      .from('ocr_jobs')
      .update({
        status: 'queued',
        attempts: Math.max(job.attempts - 1, 0),
        started_at: null,
        locked_until: null,
        next_attempt_at: new Date(Date.now() + 3_600_000).toISOString(),
      })
      .eq('id', job.id);
    return 'later';
  }
  const receipt = await admin
    .from('receipts')
    .select('file_id, mime_type')
    .eq('company_id', job.company_id)
    .eq('id', job.receipt_id)
    .is('deleted_at', null)
    .maybeSingle();
  if (receipt.error) throw new InternalError(receipt.error);
  if (!receipt.data) {
    await failJob(job, 'The receipt no longer exists.', false);
    return 'failed';
  }
  try {
    const file = await getService('storage').get(String(receipt.data.file_id));
    const read = await readImage(
      settings.key,
      file.bytes,
      String(receipt.data.mime_type),
      settings.hints,
    );
    const found = extractReceipt(read.lines, {
      dateOrder: settings.dateOrder,
      today: new Date().toISOString().slice(0, 10),
    });
    if (Object.keys(found.fields).length === 0) {
      await failJob(
        job,
        'Nothing could be read from this receipt. Enter the details by hand.',
        false,
      );
      return 'failed';
    }
    // The expense service is told first (the call can be repeated safely); the job is marked done after.
    await reportToExpenses(job.company_id, job.receipt_id, found.fields);
    const done = await admin
      .from('ocr_jobs')
      .update({
        status: 'done',
        fields: found.fields,
        confidence: found.confidence,
        error: null,
        locked_until: null,
        finished_at: new Date().toISOString(),
      })
      .eq('id', job.id)
      .eq('status', 'processing')
      .select('id');
    if (done.error) throw new InternalError(done.error);
    if ((done.data ?? []).length === 0) return 'later';
    await record(job.company_id, 'ocr.job_done', job.id, { fields: Object.keys(found.fields) });
    return 'done';
  } catch (e) {
    if (e instanceof OcrApiError) {
      await failJob(job, e.message, e.retryable);
      return e.retryable && job.attempts < OCR_MAX_ATTEMPTS ? 'retry' : 'failed';
    }
    log.error('ocr job failed', { jobId: job.id, error: e });
    await failJob(job, 'The receipt could not be read.', true);
    return job.attempts < OCR_MAX_ATTEMPTS ? 'retry' : 'failed';
  }
}

/** Cron, every minute: queues waiting receipts and reads one batch of due jobs. */
export async function runOcr(): Promise<{ queued: number; done: number; failed: number }> {
  const { queued } = await enqueuePending();
  const { data, error } = await getAdminSupabase().rpc('kd_claim_ocr_jobs', {
    p_limit: OCR_BATCH,
    p_lock_seconds: OCR_LOCK_SECONDS,
  });
  if (error) throw new InternalError(error);
  let done = 0;
  let failed = 0;
  for (const job of (data ?? []) as Claimed[]) {
    try {
      const outcome = await processOne(job);
      if (outcome === 'done') done += 1;
      if (outcome === 'failed') failed += 1;
    } catch (e) {
      log.error('ocr job crashed', { jobId: job.id, error: e });
    }
  }
  return { queued, done, failed };
}

/* ---------- by the owner ---------- */

/** Reads a receipt again. */
export async function retryJob(actor: Actor, id: string): Promise<JobView> {
  const companyId = actor.companyId;
  if (!companyId) throw new ValidationError('A company is needed.');
  const row = await rowOf(companyId, id);
  if (row.status !== 'failed' && row.status !== 'done')
    throw new ConflictError('This job is still being worked on.');
  if ((await keyOf(companyId)) === null)
    throw new ConflictError('Switch OCR on and add the Google API key first.');
  const { data, error } = await getAdminSupabase()
    .from('ocr_jobs')
    .update({
      status: 'queued',
      attempts: 0,
      error: null,
      next_attempt_at: new Date().toISOString(),
      failure_reported: false,
      finished_at: null,
    })
    .eq('company_id', companyId)
    .eq('id', id)
    .eq('version', row.version)
    .select('id');
  if (error) mapIntegrationError(error);
  if ((data ?? []).length === 0) throw new ConflictError('The job changed. Reload and try again.');
  await record(companyId, 'ocr.job_retried', id, {});
  return toView(await rowOf(companyId, id));
}

/** The owner corrects the fields of a finished job; the corrected fields go to the expense service again. */
export async function correctJob(actor: Actor, id: string, input: unknown): Promise<JobView> {
  const companyId = actor.companyId;
  if (!companyId) throw new ValidationError('A company is needed.');
  const parsed = correctionInput.safeParse(input);
  if (!parsed.success)
    throw new ValidationError(parsed.error.issues[0]?.message ?? 'The correction is not valid.');
  const row = await rowOf(companyId, id);
  if (row.status !== 'done') throw new ConflictError('Only a job that was read can be corrected.');
  const fields: ReadFields = { ...row.fields };
  const confidence = { ...row.confidence };
  for (const key of ['vendor', 'date', 'total', 'tax'] as const) {
    const v = parsed.data[key];
    if (v === undefined) continue;
    if (v === null) {
      delete fields[key];
      delete confidence[key];
    } else {
      fields[key] = v;
      confidence[key] = 1;
    }
  }
  const { data, error } = await getAdminSupabase()
    .from('ocr_jobs')
    .update({
      fields,
      confidence,
      corrected_at: new Date().toISOString(),
      corrected_by: actor.userId,
    })
    .eq('company_id', companyId)
    .eq('id', id)
    .eq('version', row.version)
    .select('id');
  if (error) mapIntegrationError(error);
  if ((data ?? []).length === 0) throw new ConflictError('The job changed. Reload and try again.');
  await reportToExpenses(companyId, row.receipt_id, fields);
  await record(companyId, 'ocr.job_corrected', id, {
    fields: Object.keys(parsed.data).filter(
      (k) => parsed.data[k as keyof typeof parsed.data] !== undefined,
    ),
  });
  return toView(await rowOf(companyId, id));
}
