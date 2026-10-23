// path: services/import/imports.ts
// Spreadsheet import: upload, map the columns, preview (checks, duplicates), run in the background in small chunks.
// Every chunk saves its counters row by row, so a restart continues where it stopped.
import 'server-only';
import { getService } from '@/lib/container';
import {
  AppError,
  ConflictError,
  ForbiddenError,
  InternalError,
  NotFoundError,
  ValidationError,
} from '@/lib/errors';
import { parseCsv, TransferError } from '@/lib/transfer/csv';
import {
  applyMapping,
  missingRequired,
  splitTable,
  suggestMapping,
  type DuplicateMode,
  type ImportAction,
  type ImportTargetId,
  type ImportUpload,
  type TransferField,
} from '@/lib/transfer/mapping';
import { readXlsx } from '@/lib/transfer/xlsx';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { createLogger } from '@/lib/logger';
import type { Actor } from '@/types/contracts';
import { getImportTarget } from './registry';

const log = createLogger({ component: 'import' });
const CHUNK = 100;
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export type ImportStatus =
  'uploaded' | 'previewed' | 'queued' | 'running' | 'done' | 'failed' | 'cancelled';

export interface ImportError {
  row: number;
  message: string;
}
export interface ImportView {
  id: string;
  target: ImportTargetId;
  fileName: string;
  status: ImportStatus;
  duplicateMode: DuplicateMode;
  mapping: Record<string, string>;
  total: number;
  processed: number;
  created: number;
  updated: number;
  skipped: number;
  failed: number;
  errors: ImportError[];
  errorMessage: string;
  version: number;
  createdAt: string;
}
export interface ImportDetail extends ImportView {
  headers: string[];
  sample: string[][];
  suggested: Record<string, string>;
  fields: readonly TransferField[];
}
export interface PreviewResult {
  total: number;
  valid: number;
  invalid: number;
  duplicatesInSystem: number;
  duplicatesInFile: number;
  problems: { row: number; messages: string[] }[];
  duplicates: { row: number; sample: string }[];
}

type Row = Record<string, unknown>;
const COLUMNS =
  'id, target, file_id, file_name, file_kind, status, row_count, mapping, duplicate_mode, processed_rows, created_rows, updated_rows, skipped_rows, failed_rows, errors, error_message, created_by, version, created_at';

function toView(r: Row): ImportView {
  return {
    id: String(r.id),
    target: String(r.target) as ImportTargetId,
    fileName: String(r.file_name),
    status: String(r.status) as ImportStatus,
    duplicateMode: String(r.duplicate_mode) as DuplicateMode,
    mapping: (r.mapping ?? {}) as Record<string, string>,
    total: Math.trunc(Number(r.row_count)),
    processed: Math.trunc(Number(r.processed_rows)),
    created: Math.trunc(Number(r.created_rows)),
    updated: Math.trunc(Number(r.updated_rows)),
    skipped: Math.trunc(Number(r.skipped_rows)),
    failed: Math.trunc(Number(r.failed_rows)),
    errors: (r.errors ?? []) as ImportError[],
    errorMessage: String(r.error_message ?? ''),
    version: Math.trunc(Number(r.version)),
    createdAt: String(r.created_at),
  };
}

async function loadRow(companyId: string, id: string): Promise<Row> {
  const { data, error } = await getAdminSupabase()
    .from('import_jobs')
    .select(COLUMNS)
    .eq('id', id)
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw new InternalError(error);
  if (!data) throw new NotFoundError();
  return data;
}

async function readTable(
  companyId: string,
  row: Row,
): Promise<{ headers: string[]; data: string[][] }> {
  const file = await getService('storage').get(String(row.file_id));
  if (file.record.companyId !== companyId) throw new NotFoundError();
  try {
    const rows =
      row.file_kind === 'xlsx'
        ? readXlsx(file.bytes)
        : parseCsv(new TextDecoder('utf-8', { fatal: false }).decode(file.bytes));
    return splitTable(rows);
  } catch (error) {
    if (error instanceof TransferError) throw new ValidationError(error.message);
    throw error;
  }
}

function actorFor(companyId: string, userId: string | null): Actor {
  return {
    userId: userId ?? '00000000-0000-0000-0000-000000000000',
    role: 'staff',
    subRole: null,
    companyId,
    email: '',
    sessionId: 'import-job',
    impersonatedBy: null,
    authenticatedAt: new Date().toISOString(),
    lastStepUpAt: null,
    mfaVerified: false,
  };
}

async function needPermission(actor: Actor, target: ImportTargetId): Promise<void> {
  const t = getImportTarget(target);
  if (!(await getService('permissions').can(actor, t.writePermission, { type: t.resourceType })))
    throw new ForbiddenError();
}

export async function createImport(actor: Actor, input: ImportUpload): Promise<ImportDetail> {
  if (!actor.companyId) throw new ValidationError('A company is needed.');
  const companyId = actor.companyId;
  await needPermission(actor, input.target);
  const bytes = Uint8Array.from(Buffer.from(input.dataBase64, 'base64'));
  const kind = /\.xlsx$/i.test(input.fileName) ? 'xlsx' : 'csv';
  let table: { headers: string[]; data: string[][] };
  try {
    table = splitTable(
      kind === 'xlsx'
        ? readXlsx(bytes)
        : parseCsv(new TextDecoder('utf-8', { fatal: false }).decode(bytes)),
    );
  } catch (error) {
    if (error instanceof TransferError) throw new ValidationError(error.message);
    throw error;
  }
  const record = await getService('storage').put({
    companyId,
    category: 'other',
    name: input.fileName,
    bytes,
    mimeType: kind === 'xlsx' ? XLSX_MIME : 'text/csv',
  });
  const target = getImportTarget(input.target);
  const { data, error } = await getAdminSupabase()
    .from('import_jobs')
    .insert({
      company_id: companyId,
      target: input.target,
      file_id: record.id,
      file_name: input.fileName,
      file_kind: kind,
      row_count: table.data.length,
      mapping: suggestMapping(table.headers, target.fields),
      created_by: actor.userId,
    })
    .select('id')
    .single();
  if (error) throw new InternalError(error);
  await getService('audit').record({
    action: 'import.uploaded',
    resourceType: 'import_job',
    resourceId: String(data.id),
    companyId,
    metadata: { target: input.target, rows: table.data.length, by: actor.userId },
  });
  return getImport(companyId, String(data.id));
}

/** Only the plain data of the fields, so the page can pass them to the browser. */
function plainFields(fields: readonly TransferField[]): TransferField[] {
  return fields.map((f) => ({
    key: f.key,
    label: f.label,
    required: f.required,
    aliases: f.aliases,
  }));
}

export async function getImport(companyId: string, id: string): Promise<ImportDetail> {
  const row = await loadRow(companyId, id);
  const view = toView(row);
  const target = getImportTarget(view.target);
  if (view.status !== 'uploaded' && view.status !== 'previewed')
    return { ...view, headers: [], sample: [], suggested: {}, fields: plainFields(target.fields) };
  const table = await readTable(companyId, row);
  return {
    ...view,
    headers: table.headers,
    sample: table.data.slice(0, 5),
    suggested: suggestMapping(table.headers, target.fields),
    fields: plainFields(target.fields),
  };
}

export async function listImports(companyId: string): Promise<ImportView[]> {
  const { data, error } = await getAdminSupabase()
    .from('import_jobs')
    .select(COLUMNS)
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw new InternalError(error);
  return (data ?? []).map(toView);
}

async function inBatches<T, R>(
  items: readonly T[],
  size: number,
  fn: (x: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += size)
    out.push(...(await Promise.all(items.slice(i, i + size).map(fn))));
  return out;
}

export async function previewImport(
  actor: Actor,
  id: string,
  mapping: Record<string, string>,
  duplicateMode: DuplicateMode,
): Promise<PreviewResult> {
  if (!actor.companyId) throw new ValidationError('A company is needed.');
  const companyId = actor.companyId;
  const row = await loadRow(companyId, id);
  const view = toView(row);
  await needPermission(actor, view.target);
  if (view.status !== 'uploaded' && view.status !== 'previewed')
    throw new ValidationError('This import can no longer be changed.');
  const target = getImportTarget(view.target);
  const table = await readTable(companyId, row);
  const known = new Set(table.headers);
  const clean: Record<string, string> = {};
  for (const [key, header] of Object.entries(mapping)) {
    if (!target.fields.some((f) => f.key === key))
      throw new ValidationError('Unknown field in the mapping.');
    if (header !== '') {
      if (!known.has(header)) throw new ValidationError('A mapped column is not in the file.');
      clean[key] = header;
    }
  }
  const missing = missingRequired(target.fields, clean);
  if (missing.length > 0) throw new ValidationError(`Choose a column for: ${missing.join(', ')}.`);
  const rows = applyMapping(table.headers, table.data, clean);
  const parsed = rows.map((r) => target.parse(r));
  const problems: PreviewResult['problems'] = [];
  const seen = new Map<string, number>();
  let invalid = 0;
  let inFile = 0;
  const valid: { index: number; value: unknown }[] = [];
  parsed.forEach((p, i) => {
    if (!p.ok) {
      invalid += 1;
      if (problems.length < 50) problems.push({ row: i + 2, messages: p.errors });
      return;
    }
    const key = target.fileKey(p.value);
    if (key !== null) {
      if (seen.has(key)) inFile += 1;
      else seen.set(key, i);
    }
    valid.push({ index: i, value: p.value });
  });
  const found = await inBatches(valid, 10, async (v) => ({
    index: v.index,
    existing: await target.findDuplicate(companyId, v.value),
  }));
  const dups = found.filter((f) => f.existing !== null);
  const first = target.fields[0]?.key ?? '';
  const r = await getAdminSupabase()
    .from('import_jobs')
    .update({ mapping: clean, duplicate_mode: duplicateMode, status: 'previewed' })
    .eq('id', id)
    .eq('company_id', companyId)
    .in('status', ['uploaded', 'previewed']);
  if (r.error) throw new InternalError(r.error);
  return {
    total: rows.length,
    valid: valid.length,
    invalid,
    duplicatesInSystem: dups.length,
    duplicatesInFile: inFile,
    problems,
    duplicates: dups
      .slice(0, 50)
      .map((d) => ({ row: d.index + 2, sample: rows[d.index]?.[first] ?? '' })),
  };
}

export async function runAction(
  actor: Actor,
  id: string,
  action: ImportAction,
): Promise<ImportView> {
  if (!actor.companyId) throw new ValidationError('A company is needed.');
  const companyId = actor.companyId;
  const admin = getAdminSupabase();
  const view = toView(await loadRow(companyId, id));
  await needPermission(actor, view.target);
  if (action.action === 'preview') {
    await previewImport(actor, id, action.mapping, action.duplicateMode);
  } else if (action.action === 'run') {
    if (view.status !== 'previewed')
      throw new ValidationError('Check the preview before starting the import.');
    const r = await admin
      .from('import_jobs')
      .update({ status: 'queued', started_at: new Date().toISOString() })
      .eq('id', id)
      .eq('company_id', companyId)
      .eq('status', 'previewed')
      .select('id');
    if (r.error) throw new InternalError(r.error);
    if (!r.data || r.data.length === 0) throw new ConflictError();
    await getService('jobs').enqueue(
      'transfer.import',
      { jobId: id },
      { dedupeKey: `import:${id}:0` },
    );
    await getService('audit').record({
      action: 'import.started',
      resourceType: 'import_job',
      resourceId: id,
      companyId,
      metadata: { target: view.target, mode: view.duplicateMode, by: actor.userId },
    });
  } else {
    const r = await admin
      .from('import_jobs')
      .update({ status: 'cancelled', finished_at: new Date().toISOString() })
      .eq('id', id)
      .eq('company_id', companyId)
      .in('status', ['uploaded', 'previewed', 'queued', 'running'])
      .select('id');
    if (r.error) throw new InternalError(r.error);
    if (!r.data || r.data.length === 0)
      throw new ValidationError('This import has already finished.');
    await getService('audit').record({
      action: 'import.cancelled',
      resourceType: 'import_job',
      resourceId: id,
      companyId,
      metadata: { by: actor.userId },
    });
  }
  return toView(await loadRow(companyId, id));
}

/** Job: works through the next rows of a queued import; queues itself again until every row is done. */
export async function runImportChunk(jobId: string, companyId: string): Promise<void> {
  const admin = getAdminSupabase();
  const row = await loadRow(companyId, jobId);
  const view = toView(row);
  if (view.status !== 'queued' && view.status !== 'running') return;
  const target = getImportTarget(view.target);
  const actor = actorFor(companyId, row.created_by ? String(row.created_by) : null);
  if (view.status === 'queued')
    await admin
      .from('import_jobs')
      .update({ status: 'running' })
      .eq('id', jobId)
      .eq('company_id', companyId)
      .eq('status', 'queued');
  try {
    const table = await readTable(companyId, row);
    const rows = applyMapping(table.headers, table.data, view.mapping);
    const end = Math.min(view.processed + CHUNK, rows.length);
    const counts = {
      processed: view.processed,
      created: view.created,
      updated: view.updated,
      skipped: view.skipped,
      failed: view.failed,
    };
    const errors = [...view.errors];
    for (let i = view.processed; i < end; i += 1) {
      const parsed = target.parse(rows[i] ?? {});
      const fail = (message: string): void => {
        counts.failed += 1;
        if (errors.length < 500) errors.push({ row: i + 2, message });
      };
      if (!parsed.ok) fail(parsed.errors.join(' '));
      else {
        try {
          const existing =
            view.duplicateMode === 'create'
              ? null
              : await target.findDuplicate(companyId, parsed.value);
          if (existing && view.duplicateMode === 'skip') counts.skipped += 1;
          else if (existing) {
            await target.update(actor, existing, parsed.value);
            counts.updated += 1;
          } else {
            await target.create(actor, parsed.value);
            counts.created += 1;
          }
        } catch (error) {
          fail(error instanceof AppError ? error.message : 'The row could not be saved.');
          if (!(error instanceof AppError))
            log.warn('import row failed', { jobId, row: i + 2, error });
        }
      }
      counts.processed = i + 1;
      const save = await admin
        .from('import_jobs')
        .update({
          processed_rows: counts.processed,
          created_rows: counts.created,
          updated_rows: counts.updated,
          skipped_rows: counts.skipped,
          failed_rows: counts.failed,
          errors,
        })
        .eq('id', jobId)
        .eq('company_id', companyId)
        .eq('status', 'running')
        .select('id');
      if (save.error) throw new InternalError(save.error);
      if (!save.data || save.data.length === 0) return; // cancelled while running
    }
    if (counts.processed >= rows.length) {
      await admin
        .from('import_jobs')
        .update({ status: 'done', finished_at: new Date().toISOString() })
        .eq('id', jobId)
        .eq('company_id', companyId)
        .eq('status', 'running');
      await getService('audit').record({
        action: 'import.finished',
        resourceType: 'import_job',
        resourceId: jobId,
        companyId,
        metadata: { target: view.target, ...counts },
      });
      await getService('notification')
        .notify({
          companyId,
          type: 'import.finished',
          title: `Import finished: ${view.fileName}`,
          body: `${counts.created} added, ${counts.updated} updated, ${counts.skipped} skipped, ${counts.failed} failed.`,
          href: `/imports/${jobId}`,
        })
        .catch(() => undefined);
    } else {
      await getService('jobs').enqueue(
        'transfer.import',
        { jobId },
        { dedupeKey: `import:${jobId}:${counts.processed}` },
      );
    }
  } catch (error) {
    await admin
      .from('import_jobs')
      .update({
        status: 'failed',
        finished_at: new Date().toISOString(),
        error_message:
          error instanceof AppError
            ? error.message.slice(0, 500)
            : 'The import stopped because of an internal error.',
      })
      .eq('id', jobId)
      .eq('company_id', companyId)
      .in('status', ['queued', 'running']);
    throw error;
  }
}
