// path: services/storage/migrate.ts
// Moves files between providers (REQ-STORAGE item 6): copy the encrypted object, read it back and compare the hash,
// switch `storage_provider` and `storage_ref` in one conditional update, then optionally delete the source copy.
// Jobs are resumable: items are claimed in small batches by a cron job and retried up to four times.
import 'server-only';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { getService } from '@/lib/container';
import { InternalError, NotFoundError, ValidationError } from '@/lib/errors';
import { createLogger } from '@/lib/logger';
import { ProviderUnavailableError } from '@/lib/storage/adapters/base';
import { getAdminSupabase } from '@/lib/supabase/admin';
import type { Actor, FileRecord, StorageProvider } from '@/types/contracts';
import { logAccess } from './access-log';
import { loadConnection } from './drive-access';
import { assertCanAccess, currentActorOrNull, fileRow, loadFile, toRecord } from './files';
import { getAdapter } from './providers';

const log = createLogger({ component: 'storage-migrate' });
const sha = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');

async function assertTargetUsable(
  companyId: string | null,
  target: StorageProvider,
): Promise<void> {
  if (target === 'supabase') return;
  if (!companyId) throw new ValidationError('Platform files stay in the platform storage.');
  const link = await loadConnection(companyId);
  if (!link || link.status !== 'connected') {
    throw new ValidationError('Link Google Drive first, or wait until the link works again.');
  }
}

/** Moves one file. Returns the record as it is afterwards (unchanged when it was already on the target). */
export async function migrateFile(
  fileId: string,
  target: StorageProvider,
  options: { deleteSource?: boolean; checkAccess?: boolean } = {},
): Promise<FileRecord> {
  const row = await loadFile(fileId);
  if (options.checkAccess !== false) await assertCanAccess(row, await currentActorOrNull());
  if (row.storage_provider === target) return toRecord(row);
  await assertTargetUsable(row.company_id, target);

  const source = getAdapter(row.storage_provider);
  const destination = getAdapter(target);
  const sealed = await source.get(row.storage_ref, row.company_id);
  const sealedHash = sha(sealed);
  const stored = await destination.put({
    companyId: row.company_id,
    category: row.category,
    fileId: row.id,
    bytes: sealed,
  });

  try {
    const copy = await destination.get(stored.ref, row.company_id);
    if (sha(copy) !== sealedHash)
      throw new ProviderUnavailableError(target, 'The copy does not match the original.');
    const { data, error } = await getAdminSupabase()
      .from('files')
      .update({ storage_provider: target, storage_ref: stored.ref })
      .eq('id', row.id)
      .eq('storage_provider', row.storage_provider)
      .eq('storage_ref', row.storage_ref)
      .is('deleted_at', null)
      .select('*');
    if (error) throw new InternalError(error);
    if (!data || data.length === 0) {
      // The file changed while it was copied (deleted or moved by someone else): drop the copy.
      await destination.remove(stored.ref, row.company_id).catch(() => undefined);
      return toRecord(await loadFile(fileId));
    }
    const moved = fileRow.parse(data[0]);
    if (options.deleteSource) {
      await source
        .remove(row.storage_ref, row.company_id)
        .catch((e: unknown) => log.warn('source copy could not be deleted', { file: row.id, e }));
    }
    await logAccess(row.company_id, row.id, 'migrate', target);
    await getService('audit').record({
      action: 'file.migrated',
      resourceType: 'file',
      resourceId: row.id,
      companyId: row.company_id,
      metadata: {
        from: row.storage_provider,
        to: target,
        source_deleted: options.deleteSource === true,
      },
    });
    return toRecord(moved);
  } catch (error) {
    await destination.remove(stored.ref, row.company_id).catch(() => undefined);
    throw error;
  }
}

export const startMigrationSchema = z
  .object({
    target: z.enum(['google_drive', 'supabase']),
    deleteSource: z.boolean().default(false),
    /** Empty or missing: every file of the company. */
    fileIds: z.array(z.string().uuid()).max(500).optional(),
    /** Platform staff only: the company whose files are moved. */
    companyId: z.string().uuid().optional(),
  })
  .strict();
export type StartMigrationInput = z.infer<typeof startMigrationSchema>;

export async function startMigration(actor: Actor, input: StartMigrationInput): Promise<string> {
  const admin = getAdminSupabase();
  const companyId = actor.companyId ?? input.companyId ?? null;
  if (!companyId) throw new ValidationError('Choose the company whose files are moved.');
  if (actor.companyId && input.companyId && input.companyId !== actor.companyId)
    throw new NotFoundError();
  await assertTargetUsable(companyId, input.target);
  const { data, error } = await admin
    .from('storage_migrations')
    .insert({
      company_id: companyId,
      target_provider: input.target,
      delete_source: input.deleteSource,
      requested_by: actor.userId,
    })
    .select('id')
    .single();
  if (error) {
    if (error.code === '23505')
      throw new ValidationError('A file move is already running for this company.');
    throw new InternalError(error);
  }
  const id = String(data.id);
  if (input.fileIds && input.fileIds.length > 0) {
    const files = await admin
      .from('files')
      .select('id')
      .eq('company_id', companyId)
      .neq('storage_provider', input.target)
      .is('deleted_at', null)
      .in('id', input.fileIds);
    if (files.error) throw new InternalError(files.error);
    const rows = (files.data ?? []).map((f) => ({
      company_id: companyId,
      migration_id: id,
      file_id: String(f.id),
    }));
    if (rows.length > 0) {
      const ins = await admin.from('storage_migration_items').insert(rows);
      if (ins.error) throw new InternalError(ins.error);
    }
    const upd = await admin
      .from('storage_migrations')
      .update(
        rows.length === 0
          ? { item_count: 0, status: 'done', finished_at: new Date().toISOString() }
          : { item_count: rows.length },
      )
      .eq('id', id);
    if (upd.error) throw new InternalError(upd.error);
  } else {
    const enq = await admin.rpc('kd_migration_enqueue_all', { p_migration: id });
    if (enq.error) throw new InternalError(enq.error);
  }
  await getService('audit').record({
    action: 'storage.migration_started',
    resourceType: 'storage_migration',
    resourceId: id,
    companyId,
    metadata: {
      target: input.target,
      delete_source: input.deleteSource,
      selected: input.fileIds?.length ?? 'all',
    },
  });
  return id;
}

export const migrationControlSchema = z
  .object({ id: z.string().uuid(), op: z.enum(['pause', 'resume', 'cancel']) })
  .strict();

export async function controlMigration(
  actor: Actor,
  input: z.infer<typeof migrationControlSchema>,
): Promise<void> {
  const admin = getAdminSupabase();
  const found = await admin
    .from('storage_migrations')
    .select('id, company_id, status')
    .eq('id', input.id)
    .is('deleted_at', null)
    .maybeSingle();
  if (found.error) throw new InternalError(found.error);
  if (!found.data) throw new NotFoundError();
  if (actor.companyId && found.data.company_id !== actor.companyId) throw new NotFoundError();
  const from = input.op === 'resume' ? 'paused' : input.op === 'pause' ? 'running' : null;
  const patch =
    input.op === 'cancel'
      ? { status: 'cancelled', finished_at: new Date().toISOString() }
      : { status: input.op === 'pause' ? 'paused' : 'running' };
  let query = admin
    .from('storage_migrations')
    .update(patch)
    .eq('id', input.id)
    .is('deleted_at', null);
  query = from ? query.eq('status', from) : query.in('status', ['running', 'paused']);
  const { data, error } = await query.select('id');
  if (error) throw new InternalError(error);
  if (!data || data.length === 0)
    throw new ValidationError('This move cannot be changed in its current state.');
  await getService('audit').record({
    action: `storage.migration_${input.op}`,
    resourceType: 'storage_migration',
    resourceId: input.id,
    companyId: String(found.data.company_id ?? '') || null,
    metadata: { by: actor.userId },
  });
}

const claimRow = z
  .object({
    item_id: z.string().uuid(),
    file_id: z.string().uuid(),
    target_provider: z.enum(['google_drive', 'supabase']),
    delete_source: z.boolean(),
  })
  .strip();

/** One tick of the cron job: moves a few files of running migrations. */
export async function processMigrations(limit = 5): Promise<{ done: number; failed: number }> {
  const admin = getAdminSupabase();
  const claimed = await admin.rpc('kd_migration_claim', { p_limit: limit });
  if (claimed.error) throw new InternalError(claimed.error);
  let done = 0;
  let failed = 0;
  for (const item of z.array(claimRow).parse(claimed.data ?? [])) {
    try {
      const before = await loadFile(item.file_id).catch(() => null);
      if (!before || before.storage_provider === item.target_provider) {
        await admin.rpc('kd_migration_item_result', {
          p_item: item.item_id,
          p_status: 'skipped',
          p_error: null,
        });
        continue;
      }
      await migrateFile(item.file_id, item.target_provider, {
        deleteSource: item.delete_source,
        checkAccess: false,
      });
      await admin.rpc('kd_migration_item_result', {
        p_item: item.item_id,
        p_status: 'done',
        p_error: null,
      });
      done += 1;
    } catch (error) {
      failed += 1;
      const message = error instanceof Error ? error.message : 'The file could not be moved.';
      log.warn('file move failed', { item: item.item_id, message });
      await admin.rpc('kd_migration_item_result', {
        p_item: item.item_id,
        p_status: 'failed',
        p_error: message,
      });
    }
  }
  return { done, failed };
}

export interface MigrationView {
  id: string;
  companyId: string | null;
  target: StorageProvider;
  deleteSource: boolean;
  status: string;
  total: number;
  done: number;
  failed: number;
  skipped: number;
  lastError: string | null;
  startedAt: string;
}

export async function listMigrations(companyId: string | null): Promise<MigrationView[]> {
  let query = getAdminSupabase()
    .from('storage_migrations')
    .select('*')
    .is('deleted_at', null)
    .order('started_at', { ascending: false })
    .limit(20);
  if (companyId) query = query.eq('company_id', companyId);
  const { data, error } = await query;
  if (error) throw new InternalError(error);
  return (data ?? []).map((r) => ({
    id: String(r.id),
    companyId: r.company_id ? String(r.company_id) : null,
    target: String(r.target_provider) as StorageProvider,
    deleteSource: r.delete_source === true,
    status: String(r.status),
    total: Number(r.item_count),
    done: Number(r.done_count),
    failed: Number(r.failed_count),
    skipped: Number(r.skipped_count),
    lastError: r.last_error ? String(r.last_error) : null,
    startedAt: String(r.started_at),
  }));
}
