// path: services/lifecycle/data.ts
// Data tools of a company: one-click export and backup (a gzip file of JSON in the storage contract, with a checksum),
// scheduled backups with the last 10 kept, owner approval for exports asked for by staff, and the closure of an
// account with a 30 day grace period. Work is done by the job in cron/jobs/s07-lifecycle.ts, never inside a request.
import 'server-only';
import { gzipSync } from 'node:zlib';
import { z } from 'zod';
import { getService, tryGetService } from '@/lib/container';
import {
  ConflictError,
  ForbiddenError,
  InternalError,
  NotFoundError,
  ValidationError,
} from '@/lib/errors';
import { createLogger } from '@/lib/logger';
import { tenantExports } from '@/lib/lifecycle/registry';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { sha256Hex } from '@/lib/utils/hash';
import { getSection, saveSectionFor } from '@/services/company/settings';
import type { Actor } from '@/types/contracts';
import './exports';

const log = createLogger({ component: 'lifecycle' });
const DAY = 86_400_000;
export const GRACE_DAYS = 30;
export const EXPORT_LIFETIME_DAYS = 7;
export const KEEP_BACKUPS = 10;
const PAGE = 1000;
const MAX_ROWS_PER_TABLE = 250_000;
const MAX_BYTES = 150 * 1024 * 1024;

export const requestSchema = z.object({ kind: z.enum(['export', 'backup']) }).strict();
export const closureSchema = z.discriminatedUnion('action', [
  z
    .object({ action: z.literal('request'), companyName: z.string().trim().min(1).max(200) })
    .strict(),
  z.object({ action: z.literal('cancel') }).strict(),
]);
export const downloadSchema = z.object({ id: z.string().uuid() }).strict();

export interface RequestView {
  id: string;
  kind: 'export' | 'backup' | 'closure';
  status: string;
  createdAt: string;
  finishedAt: string | null;
  expiresAt: string | null;
  scheduledFor: string | null;
  sizeBytes: number | null;
  checksum: string | null;
  rows: number;
  error: string;
}

const COLUMNS =
  'id, kind, status, created_at, finished_at, expires_at, scheduled_for, size_bytes, checksum, row_counts, error, file_id';

function toView(r: Record<string, unknown>): RequestView {
  const counts = (r.row_counts ?? {}) as Record<string, number>;
  return {
    id: String(r.id),
    kind: String(r.kind) as RequestView['kind'],
    status: String(r.status),
    createdAt: String(r.created_at),
    finishedAt: r.finished_at ? String(r.finished_at) : null,
    expiresAt: r.expires_at ? String(r.expires_at) : null,
    scheduledFor: r.scheduled_for ? String(r.scheduled_for) : null,
    sizeBytes: r.size_bytes === null ? null : Number(r.size_bytes),
    checksum: r.checksum ? String(r.checksum) : null,
    rows: Object.values(counts).reduce((a, b) => a + Number(b), 0),
    error: String(r.error ?? ''),
  };
}

export async function listRequests(companyId: string): Promise<RequestView[]> {
  const { data, error } = await getAdminSupabase()
    .from('data_requests')
    .select(COLUMNS)
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(30);
  if (error) throw new InternalError(error);
  return (data ?? []).map(toView);
}

/** Starts an export or a backup. Staff, or owner approval rules, put the request in the approval chain first. */
export async function createRequest(
  actor: Actor,
  input: z.infer<typeof requestSchema>,
): Promise<RequestView> {
  const companyId = actor.companyId;
  if (!companyId) throw new ValidationError('A company is needed.');
  if (input.kind === 'backup' && actor.role !== 'owner') throw new ForbiddenError();
  const policy = await getSection(companyId, 'policy');
  const needsApproval =
    input.kind === 'export' && actor.role === 'staff' && policy.value.exportNeedsOwnerApproval;
  const admin = getAdminSupabase();
  const { data, error } = await admin
    .from('data_requests')
    .insert({
      company_id: companyId,
      kind: input.kind,
      requested_by: actor.userId,
      status: needsApproval ? 'awaiting_approval' : 'pending',
    })
    .select(COLUMNS)
    .single();
  if (error) {
    if (error.code === '23505') throw new ConflictError('An export is already in progress.');
    throw new InternalError(error);
  }
  if (needsApproval) {
    const state = await getService('approval').request({
      action: 'data.export',
      payload: { requestId: String(data.id) },
      requesterId: actor.userId,
      companyId,
    });
    await admin
      .from('data_requests')
      .update({ approval_request_id: state.requestId })
      .eq('id', String(data.id));
  }
  await getService('audit').record({
    action: `data.${input.kind}_requested`,
    resourceType: 'data_request',
    resourceId: String(data.id),
    companyId,
    metadata: { by: actor.userId, approval: needsApproval },
  });
  return toView(data);
}

async function readTable(
  companyId: string,
  table: string,
  columns: readonly string[],
): Promise<Record<string, unknown>[]> {
  const admin = getAdminSupabase();
  const out: Record<string, unknown>[] = [];
  const filterColumn = table === 'companies' ? 'id' : 'company_id';
  for (let from = 0; from < MAX_ROWS_PER_TABLE; from += PAGE) {
    const { data, error } = await admin
      .from(table)
      .select(columns.join(', '))
      .eq(filterColumn, companyId)
      .is('deleted_at', null)
      .order('created_at', { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw new InternalError(error);
    const rows = (data ?? []) as unknown as Record<string, unknown>[];
    out.push(...rows);
    if (rows.length < PAGE) break;
  }
  return out;
}

/** Builds the export file of one request and stores it. */
export async function runRequest(row: Record<string, unknown>): Promise<void> {
  const id = String(row.id);
  const companyId = String(row.company_id);
  const admin = getAdminSupabase();
  try {
    const data: Record<string, unknown[]> = {};
    const counts: Record<string, number> = {};
    for (const def of tenantExports()) {
      const rows = await readTable(companyId, def.table, def.columns);
      data[def.label] = rows;
      counts[def.label] = rows.length;
    }
    const body = JSON.stringify({
      format: 'kd-tenant-export',
      version: 1,
      companyId,
      createdAt: new Date().toISOString(),
      tables: data,
    });
    const bytes = new Uint8Array(gzipSync(Buffer.from(body, 'utf8')));
    if (bytes.length > MAX_BYTES)
      throw new ValidationError(
        'The export is too large for one file. Ask support for a split export.',
      );
    const checksum = await sha256Hex(bytes);
    const stamp = new Date().toISOString().slice(0, 10);
    const file = await getService('storage').put({
      companyId,
      category: 'export',
      name: `${String(row.kind)}-${stamp}.json.gz`,
      bytes,
      mimeType: 'application/gzip',
    });
    await admin
      .from('data_requests')
      .update({
        status: 'ready',
        file_id: file.id,
        checksum,
        size_bytes: bytes.length,
        row_counts: counts,
        finished_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + EXPORT_LIFETIME_DAYS * DAY).toISOString(),
        error: '',
      })
      .eq('id', id);
    await getService('audit').record({
      action: `data.${String(row.kind)}_ready`,
      resourceType: 'data_request',
      resourceId: id,
      companyId,
      metadata: { bytes: bytes.length, checksum },
    });
    await getService('notification')
      .notify({
        companyId,
        type: 'data.ready',
        title: 'Your data file is ready',
        body: `The file is available for ${EXPORT_LIFETIME_DAYS} days.`,
        href: '/settings/data',
      })
      .catch(() => undefined);
  } catch (error) {
    log.error('data request failed', {
      id,
      error: error instanceof Error ? error.message : 'failed',
    });
    await admin
      .from('data_requests')
      .update({
        status: 'failed',
        finished_at: new Date().toISOString(),
        error:
          error instanceof ValidationError
            ? error.message.slice(0, 300)
            : 'The file could not be built. Try again later.',
      })
      .eq('id', id);
  }
}

/** Short-lived link to a ready file of the own company. Opening it is audited. */
export async function downloadLink(actor: Actor, id: string): Promise<{ url: string }> {
  const companyId = actor.companyId;
  if (!companyId || actor.role !== 'owner') throw new NotFoundError();
  const { data, error } = await getAdminSupabase()
    .from('data_requests')
    .select('id, file_id, status, expires_at, kind')
    .eq('id', id)
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw new InternalError(error);
  if (!data || data.status !== 'ready' || !data.file_id) throw new NotFoundError();
  if (data.expires_at && Date.parse(String(data.expires_at)) <= Date.now())
    throw new ValidationError('This file has expired. Create a new one.');
  const url = await getService('storage').signedUrl(String(data.file_id), 300);
  await getService('audit').record({
    action: 'data.downloaded',
    resourceType: 'data_request',
    resourceId: id,
    companyId,
    metadata: { by: actor.userId, kind: String(data.kind) },
  });
  return { url };
}

export async function runClosure(
  actor: Actor,
  input: z.infer<typeof closureSchema>,
): Promise<RequestView | null> {
  const companyId = actor.companyId;
  if (!companyId || actor.role !== 'owner') throw new ForbiddenError();
  const admin = getAdminSupabase();
  if (input.action === 'cancel') {
    const { data, error } = await admin
      .from('data_requests')
      .update({ status: 'cancelled', finished_at: new Date().toISOString() })
      .eq('company_id', companyId)
      .eq('kind', 'closure')
      .eq('status', 'pending')
      .select('id');
    if (error) throw new InternalError(error);
    if (!data || data.length === 0) throw new NotFoundError();
    await getService('audit').record({
      action: 'account.closure_cancelled',
      resourceType: 'company',
      resourceId: companyId,
      companyId,
      metadata: { by: actor.userId },
    });
    return null;
  }
  const company = await admin.from('companies').select('name').eq('id', companyId).maybeSingle();
  if (company.error) throw new InternalError(company.error);
  if (
    !company.data ||
    input.companyName.trim().toLowerCase() !== String(company.data.name).trim().toLowerCase()
  )
    throw new ValidationError('Type the company name exactly as shown to confirm.');
  const when = new Date(Date.now() + GRACE_DAYS * DAY).toISOString();
  const { data, error } = await admin
    .from('data_requests')
    .insert({
      company_id: companyId,
      kind: 'closure',
      requested_by: actor.userId,
      status: 'pending',
      scheduled_for: when,
    })
    .select(COLUMNS)
    .single();
  if (error) {
    if (error.code === '23505') throw new ConflictError('A closure is already planned.');
    throw new InternalError(error);
  }
  await getService('audit').record({
    action: 'account.closure_requested',
    resourceType: 'company',
    resourceId: companyId,
    companyId,
    metadata: { by: actor.userId, scheduledFor: when },
  });
  await getService('notification')
    .notify({
      companyId,
      type: 'account.closure',
      title: 'Account closure planned',
      body: `Your account will close on ${when.slice(0, 10)}. You can cancel until then.`,
      href: '/settings/data',
    })
    .catch(() => undefined);
  return toView(data);
}

/** Job step 1: build the files of waiting requests. */
export async function processWaiting(limit = 3): Promise<number> {
  const { data, error } = await getAdminSupabase().rpc('kd_data_request_claim', { p_limit: limit });
  if (error) throw new InternalError(error);
  const rows = (data ?? []) as Record<string, unknown>[];
  for (const row of rows) await runRequest(row);
  return rows.length;
}

/** Job step 2: release exports that wait for the owner's approval once the approval engine decided. */
export async function syncExportApprovals(): Promise<number> {
  const admin = getAdminSupabase();
  const { data, error } = await admin
    .from('data_requests')
    .select('id, company_id, approval_request_id')
    .eq('status', 'awaiting_approval')
    .not('approval_request_id', 'is', null)
    .is('deleted_at', null)
    .limit(100);
  if (error) throw new InternalError(error);
  let n = 0;
  for (const row of data ?? []) {
    const state = await getService('approval')
      .status(String(row.approval_request_id))
      .catch(() => null);
    if (!state) continue;
    if (state.status === 'approved')
      await admin.from('data_requests').update({ status: 'pending' }).eq('id', String(row.id));
    else if (['rejected', 'expired', 'cancelled'].includes(state.status))
      await admin
        .from('data_requests')
        .update({
          status: 'cancelled',
          finished_at: new Date().toISOString(),
          error: 'The export was not approved.',
        })
        .eq('id', String(row.id));
    else continue;
    n += 1;
  }
  return n;
}

/** Job step 3: start scheduled backups, keep the last 10, drop expired export files. */
export async function runSchedules(): Promise<number> {
  const admin = getAdminSupabase();
  const { data, error } = await admin
    .from('company_settings')
    .select('company_id, value')
    .eq('section', 'backup')
    .is('deleted_at', null)
    .limit(500);
  if (error) throw new InternalError(error);
  let started = 0;
  for (const row of data ?? []) {
    const value = row.value as { schedule?: string; lastScheduledAt?: string | null };
    if (value.schedule !== 'daily' && value.schedule !== 'weekly') continue;
    const gap = (value.schedule === 'daily' ? 1 : 7) * DAY - 5 * 60_000;
    if (value.lastScheduledAt && Date.now() - Date.parse(value.lastScheduledAt) < gap) continue;
    const companyId = String(row.company_id);
    const company = await admin
      .from('companies')
      .select('status')
      .eq('id', companyId)
      .maybeSingle();
    if (company.data?.status !== 'active') continue;
    const owner = await admin
      .from('memberships')
      .select('user_id')
      .eq('company_id', companyId)
      .eq('role', 'owner')
      .is('deleted_at', null)
      .limit(1)
      .maybeSingle();
    if (!owner.data) continue;
    const made = await admin
      .from('data_requests')
      .insert({ company_id: companyId, kind: 'backup', requested_by: String(owner.data.user_id) });
    if (made.error) continue; // a backup or export is already running
    const current = await getSection(companyId, 'backup');
    await saveSectionFor(
      companyId,
      String(owner.data.user_id),
      'backup',
      { ...current.value, lastScheduledAt: new Date().toISOString() },
      current.version,
    ).catch(() => undefined);
    started += 1;
  }
  await pruneFiles();
  return started;
}

async function pruneFiles(): Promise<void> {
  const admin = getAdminSupabase();
  const storage = tryGetService('storage');
  if (!storage) return;
  const expired = await admin
    .from('data_requests')
    .select('id, file_id')
    .eq('status', 'ready')
    .lte('expires_at', new Date().toISOString())
    .not('file_id', 'is', null)
    .is('deleted_at', null)
    .limit(100);
  for (const r of expired.data ?? []) {
    await storage.remove(String(r.file_id)).catch(() => undefined);
    await admin
      .from('data_requests')
      .update({ status: 'completed', file_id: null })
      .eq('id', String(r.id));
  }
  // Backups: keep the newest ten ready ones per company.
  const ready = await admin
    .from('data_requests')
    .select('id, company_id, file_id, created_at')
    .eq('kind', 'backup')
    .eq('status', 'ready')
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(2000);
  const seen = new Map<string, number>();
  for (const r of ready.data ?? []) {
    const n = (seen.get(String(r.company_id)) ?? 0) + 1;
    seen.set(String(r.company_id), n);
    if (n > KEEP_BACKUPS && r.file_id) {
      await storage.remove(String(r.file_id)).catch(() => undefined);
      await admin
        .from('data_requests')
        .update({ status: 'completed', file_id: null })
        .eq('id', String(r.id));
    }
  }
}

/** Job step 4: close accounts whose grace period ended. Access ends at once; records stay under the retention rules. */
export async function processClosures(): Promise<number> {
  const admin = getAdminSupabase();
  const { data, error } = await admin
    .from('data_requests')
    .select('id, company_id')
    .eq('kind', 'closure')
    .eq('status', 'pending')
    .lte('scheduled_for', new Date().toISOString())
    .is('deleted_at', null)
    .limit(20);
  if (error) throw new InternalError(error);
  let n = 0;
  for (const row of data ?? []) {
    const companyId = String(row.company_id);
    const members = await admin
      .from('memberships')
      .select('user_id')
      .eq('company_id', companyId)
      .is('deleted_at', null);
    for (const m of members.data ?? [])
      await admin.rpc('kd_revoke_user_sessions', {
        p_user: String(m.user_id),
        p_except: null,
        p_reason: 'account_closed',
      });
    await admin
      .from('memberships')
      .update({ status: 'suspended' })
      .eq('company_id', companyId)
      .is('deleted_at', null);
    await admin
      .from('custom_domains')
      .update({ deleted_at: new Date().toISOString(), is_primary: false })
      .eq('company_id', companyId)
      .is('deleted_at', null);
    const closed = await admin
      .from('companies')
      .update({ status: 'closed' })
      .eq('id', companyId)
      .select('id');
    if (closed.error) throw new InternalError(closed.error);
    await admin
      .from('data_requests')
      .update({ status: 'completed', finished_at: new Date().toISOString() })
      .eq('id', String(row.id));
    await getService('audit').record({
      action: 'account.closed',
      resourceType: 'company',
      resourceId: companyId,
      companyId,
      metadata: { request: String(row.id) },
    });
    n += 1;
  }
  return n;
}
