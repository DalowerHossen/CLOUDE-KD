// path: services/migration/jobs.ts
// The steps the owner takes in the migration wizard: upload a file from another invoicing tool, check it (the dry run writes no
// client, product or supplier, only a report on the job), confirm and start, cancel, and look at the history and the rows. The
// work itself (writing in batches, rolling back) is done by `runner.ts`.
import 'server-only';
import { getService } from '@/lib/container';
import {
  ConflictError,
  ForbiddenError,
  InternalError,
  NotFoundError,
  ValidationError,
} from '@/lib/errors';
import {
  buildReport,
  startInput,
  suggestWithPreset,
  uploadInput,
  validateInput,
  type DryRunReport,
  type RowCheck,
} from '@/lib/migration/rules';
import { getAdminSupabase } from '@/lib/supabase/admin';
import type { Actor } from '@/types/contracts';
import type { MigrationSource, MigrationTarget } from '@/config/s16-migration';
import { applyMapping, missingRequired, readTable, targetOf, type TransferField } from './ports';

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const COLUMNS =
  'id, company_id, source, target, file_id, file_name, file_kind, status, row_count, mapping, duplicate_mode, default_values, report, processed_rows, created_rows, skipped_rows, failed_rows, committed_at, rollback_until, rolled_back_at, error, created_by, version, created_at';

export type JobStatus =
  | 'uploaded'
  | 'validated'
  | 'queued'
  | 'running'
  | 'committed'
  | 'failed'
  | 'cancelled'
  | 'rolling_back'
  | 'rolled_back'
  | 'rollback_partial';

export interface JobRow {
  id: string;
  company_id: string;
  source: MigrationSource;
  target: MigrationTarget;
  file_id: string;
  file_name: string;
  file_kind: 'csv' | 'xlsx';
  status: JobStatus;
  row_count: number;
  mapping: Record<string, string>;
  duplicate_mode: 'skip' | 'create';
  default_values: Record<string, string>;
  report: Partial<DryRunReport>;
  processed_rows: number;
  created_rows: number;
  skipped_rows: number;
  failed_rows: number;
  committed_at: string | null;
  rollback_until: string | null;
  rolled_back_at: string | null;
  error: string | null;
  created_by: string | null;
  version: number;
  created_at: string;
}

export interface JobView {
  id: string;
  source: MigrationSource;
  target: MigrationTarget;
  fileName: string;
  status: JobStatus;
  total: number;
  mapping: Record<string, string>;
  duplicateMode: 'skip' | 'create';
  defaults: Record<string, string>;
  report: Partial<DryRunReport>;
  processed: number;
  created: number;
  skipped: number;
  failed: number;
  committedAt: string | null;
  rollbackUntil: string | null;
  rolledBackAt: string | null;
  error: string | null;
  version: number;
  createdAt: string;
}

export const toView = (r: JobRow): JobView => ({
  id: r.id,
  source: r.source,
  target: r.target,
  fileName: r.file_name,
  status: r.status,
  total: r.row_count,
  mapping: r.mapping,
  duplicateMode: r.duplicate_mode,
  defaults: r.default_values,
  report: r.report,
  processed: r.processed_rows,
  created: r.created_rows,
  skipped: r.skipped_rows,
  failed: r.failed_rows,
  committedAt: r.committed_at,
  rollbackUntil: r.rollback_until,
  rolledBackAt: r.rolled_back_at,
  error: r.error,
  version: r.version,
  createdAt: r.created_at,
});

export async function record(
  companyId: string,
  action: string,
  id: string | null,
  metadata: Record<string, unknown>,
): Promise<void> {
  await getService('audit').record({
    action,
    resourceType: 'migration_job',
    resourceId: id,
    companyId,
    metadata,
  });
}

const need = (actor: Actor): string => {
  if (!actor.companyId) throw new ValidationError('A company is needed.');
  return actor.companyId;
};

/** The owner must be allowed to write the list the file goes into (the permission of the import framework of STEP 08). */
async function mayWrite(actor: Actor, target: MigrationTarget): Promise<void> {
  const t = targetOf(target);
  if (!(await getService('permissions').can(actor, t.writePermission, { type: t.resourceType })))
    throw new ForbiddenError();
}

export async function rowOf(companyId: string, id: string): Promise<JobRow> {
  const { data, error } = await getAdminSupabase()
    .from('migration_jobs')
    .select(COLUMNS)
    .eq('company_id', companyId)
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw new InternalError(error);
  if (!data) throw new NotFoundError();
  return data as unknown as JobRow;
}

export async function listJobs(companyId: string): Promise<JobView[]> {
  const { data, error } = await getAdminSupabase()
    .from('migration_jobs')
    .select(COLUMNS)
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .order('id', { ascending: false })
    .limit(100);
  if (error) throw new InternalError(error);
  return ((data ?? []) as unknown as JobRow[]).map(toView);
}

export interface JobDetail extends JobView {
  headers: string[];
  sample: string[][];
  suggested: Record<string, string>;
  fields: { key: string; label: string; required: boolean }[];
}

/** The mapped, default-filled rows of the file of a job. */
export async function loadRows(
  companyId: string,
  job: Pick<JobRow, 'file_id' | 'file_kind' | 'mapping' | 'default_values'>,
): Promise<{ headers: string[]; rows: Record<string, string>[]; data: string[][] }> {
  const file = await getService('storage').get(job.file_id);
  if (file.record.companyId !== companyId) throw new NotFoundError();
  const table = readTable(file.bytes, job.file_kind);
  const rows = applyMapping(table.headers, table.data, job.mapping).map((r) => {
    const out = { ...r };
    for (const [key, value] of Object.entries(job.default_values))
      if ((out[key] ?? '') === '') out[key] = value;
    return out;
  });
  return { headers: table.headers, rows, data: table.data };
}

export async function getJob(companyId: string, id: string): Promise<JobDetail> {
  const row = await rowOf(companyId, id);
  const view = toView(row);
  const fields: TransferField[] = [...targetOf(row.target).fields];
  const plain = fields.map((f) => ({ key: f.key, label: f.label, required: f.required }));
  if (row.status !== 'uploaded' && row.status !== 'validated')
    return { ...view, headers: [], sample: [], suggested: {}, fields: plain };
  const file = await getService('storage').get(row.file_id);
  if (file.record.companyId !== companyId) throw new NotFoundError();
  const table = readTable(file.bytes, row.file_kind);
  return {
    ...view,
    headers: table.headers,
    sample: table.data.slice(0, 10),
    suggested: suggestWithPreset(row.source, row.target, table.headers, fields),
    fields: plain,
  };
}

export async function createJob(actor: Actor, input: unknown): Promise<JobDetail> {
  const companyId = need(actor);
  const parsed = uploadInput.safeParse(input);
  if (!parsed.success)
    throw new ValidationError(parsed.error.issues[0]?.message ?? 'The upload is not valid.');
  const d = parsed.data;
  await mayWrite(actor, d.target);
  const bytes = Uint8Array.from(Buffer.from(d.dataBase64, 'base64'));
  const kind = /\.xlsx$/i.test(d.fileName) ? 'xlsx' : 'csv';
  const table = readTable(bytes, kind);
  const stored = await getService('storage').put({
    companyId,
    category: 'other',
    name: d.fileName,
    bytes,
    mimeType: kind === 'xlsx' ? XLSX_MIME : 'text/csv',
  });
  const { data, error } = await getAdminSupabase()
    .from('migration_jobs')
    .insert({
      company_id: companyId,
      source: d.source,
      target: d.target,
      file_id: stored.id,
      file_name: d.fileName,
      file_kind: kind,
      row_count: table.data.length,
      created_by: actor.userId,
    })
    .select('id')
    .single();
  if (error) throw new InternalError(error);
  const id = String(data.id);
  await record(companyId, 'migration.uploaded', id, {
    source: d.source,
    target: d.target,
    rows: table.data.length,
  });
  return getJob(companyId, id);
}

/**
 * The dry run. Reads the file with the chosen mapping and checks every row with the rules of the list, looks for records that exist
 * already, and saves a report on the job. No client, product or supplier is written.
 */
export async function validateJob(actor: Actor, id: string, input: unknown): Promise<DryRunReport> {
  const companyId = need(actor);
  const parsed = validateInput.safeParse(input);
  if (!parsed.success)
    throw new ValidationError(parsed.error.issues[0]?.message ?? 'The mapping is not valid.');
  const d = parsed.data;
  const job = await rowOf(companyId, id);
  await mayWrite(actor, job.target);
  if (job.status !== 'uploaded' && job.status !== 'validated')
    throw new ConflictError('This import can no longer be checked again.');
  const target = targetOf(job.target);
  const file = await getService('storage').get(job.file_id);
  if (file.record.companyId !== companyId) throw new NotFoundError();
  const table = readTable(file.bytes, job.file_kind);
  const known = new Set(table.headers);
  const clean: Record<string, string> = {};
  for (const [key, header] of Object.entries(d.mapping)) {
    if (!target.fields.some((f) => f.key === key))
      throw new ValidationError('Unknown field in the mapping.');
    if (header === '') continue;
    if (!known.has(header)) throw new ValidationError('A mapped column is not in the file.');
    clean[key] = header;
  }
  // A default fills a field for every row that has none, so a field with a default needs no column.
  const covered = { ...clean };
  for (const key of Object.keys(d.defaults)) covered[key] = covered[key] ?? '(default)';
  const missing = missingRequired(target.fields, covered);
  if (missing.length > 0)
    throw new ValidationError(`Choose a column or a default for: ${missing.join(', ')}.`);
  const { rows } = await loadRows(companyId, {
    file_id: job.file_id,
    file_kind: job.file_kind,
    mapping: clean,
    default_values: d.defaults,
  });
  const checks: RowCheck[] = [];
  const results = rows.map((r) => target.parse(r));
  for (let i = 0; i < results.length; i += 10) {
    const slice = results.slice(i, i + 10);
    const found = await Promise.all(
      slice.map(async (p) => (p.ok ? await target.findDuplicate(companyId, p.value) : null)),
    );
    slice.forEach((p, k) => {
      checks.push({
        row: i + k + 2,
        errors: p.ok ? null : p.errors,
        fileKey: p.ok ? target.fileKey(p.value) : null,
        existsInSystem: found[k] !== null && found[k] !== undefined,
      });
    });
  }
  const usedHeaders = new Set(Object.values(clean));
  const blankOptional: Record<string, number> = {};
  for (const f of target.fields.filter(
    (x) => !x.required && clean[x.key] !== undefined && ['email', 'phone'].includes(x.key),
  ))
    blankOptional[f.label] = rows.filter((r) => (r[f.key] ?? '') === '').length;
  const report = buildReport(checks, d.duplicateMode, {
    unmappedColumns: table.headers.filter((h) => !usedHeaders.has(h)),
    blankOptional,
  });
  const { data, error } = await getAdminSupabase()
    .from('migration_jobs')
    .update({
      mapping: clean,
      duplicate_mode: d.duplicateMode,
      default_values: d.defaults,
      report,
      status: 'validated',
    })
    .eq('company_id', companyId)
    .eq('id', id)
    .eq('version', job.version)
    .in('status', ['uploaded', 'validated'])
    .select('id');
  if (error) throw new InternalError(error);
  if ((data ?? []).length === 0)
    throw new ConflictError('The import changed. Reload and try again.');
  await record(companyId, 'migration.dry_run', id, {
    total: report.total,
    valid: report.valid,
    invalid: report.invalid,
    wouldCreate: report.wouldCreate,
  });
  return report;
}

/** The owner confirms the number of records the dry run said would be made, and the import is queued. */
export async function startJob(actor: Actor, id: string, input: unknown): Promise<JobView> {
  const companyId = need(actor);
  const parsed = startInput.safeParse(input);
  if (!parsed.success)
    throw new ValidationError(parsed.error.issues[0]?.message ?? 'The confirmation is not valid.');
  const job = await rowOf(companyId, id);
  await mayWrite(actor, job.target);
  if (job.status !== 'validated')
    throw new ConflictError('Check the file (the dry run) before starting.');
  const expected = job.report.wouldCreate ?? 0;
  if (expected < 1) throw new ValidationError('The dry run found nothing to create.');
  if (parsed.data.expectedCreate !== expected)
    throw new ValidationError(
      `The dry run says ${expected} record(s) will be created, not ${parsed.data.expectedCreate}. Check the report and confirm again.`,
    );
  const { data, error } = await getAdminSupabase()
    .from('migration_jobs')
    .update({ status: 'queued' })
    .eq('company_id', companyId)
    .eq('id', id)
    .eq('version', job.version)
    .eq('status', 'validated')
    .select('id');
  if (error) throw new InternalError(error);
  if ((data ?? []).length === 0)
    throw new ConflictError('The import changed. Reload and try again.');
  await record(companyId, 'migration.started', id, {
    expectedCreate: expected,
    mode: job.duplicate_mode,
  });
  return toView(await rowOf(companyId, id));
}

export async function cancelJob(actor: Actor, id: string): Promise<JobView> {
  const companyId = need(actor);
  const job = await rowOf(companyId, id);
  await mayWrite(actor, job.target);
  if (!['uploaded', 'validated', 'queued', 'running'].includes(job.status))
    throw new ConflictError('This import is over.');
  const closes = job.status === 'running';
  const { data, error } = await getAdminSupabase()
    .from('migration_jobs')
    .update({
      status: 'cancelled',
      ...(closes ? { rollback_until: new Date(Date.now() + 24 * 3_600_000).toISOString() } : {}),
    })
    .eq('company_id', companyId)
    .eq('id', id)
    .eq('status', job.status)
    .select('id');
  if (error) throw new InternalError(error);
  if ((data ?? []).length === 0)
    throw new ConflictError('The import changed. Reload and try again.');
  await record(companyId, 'migration.cancelled', id, { was: job.status });
  return toView(await rowOf(companyId, id));
}

export interface RowView {
  row: number;
  action: string;
  recordId: string | null;
  message: string | null;
}

export async function listRows(companyId: string, id: string, limit = 200): Promise<RowView[]> {
  await rowOf(companyId, id);
  const { data, error } = await getAdminSupabase()
    .from('migration_rows')
    .select('row_number, action, record_id, message')
    .eq('company_id', companyId)
    .eq('job_id', id)
    .order('row_number', { ascending: true })
    .limit(Math.min(Math.max(limit, 1), 500));
  if (error) throw new InternalError(error);
  return (data ?? []).map((r) => ({
    row: Number(r.row_number),
    action: String(r.action),
    recordId: r.record_id === null ? null : String(r.record_id),
    message: r.message === null ? null : String(r.message),
  }));
}
