// path: services/storage/retention.ts
// Retention and trash. Files past their retention date go to the trash; trash older than 30 days is removed from
// the provider for good. Orphans (provider objects without a record) are not listed by the providers' simple APIs, so
// the check is the reverse: records whose object is missing are reported by the health job (05.4).
import 'server-only';
import { createLogger } from '@/lib/logger';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { InternalError } from '@/lib/errors';
import { logAccess } from './access-log';
import { fileRow } from './files';
import { getAdapter } from './providers';

const log = createLogger({ component: 'storage-retention' });
const TRASH_DAYS = 30;

export async function runRetention(): Promise<{ trashed: number; purged: number }> {
  const admin = getAdminSupabase();
  const now = new Date().toISOString();
  const trash = await admin
    .from('files')
    .update({ deleted_at: now })
    .is('deleted_at', null)
    .lt('retention_until', now)
    .select('id');
  if (trash.error) throw new InternalError(trash.error);

  const cutoff = new Date(Date.now() - TRASH_DAYS * 86_400_000).toISOString();
  const due = await admin
    .from('files')
    .select('*')
    .is('purged_at', null)
    .not('deleted_at', 'is', null)
    .lt('deleted_at', cutoff)
    .limit(200);
  if (due.error) throw new InternalError(due.error);
  let purged = 0;
  for (const raw of due.data ?? []) {
    const row = fileRow.parse(raw);
    try {
      await getAdapter(row.storage_provider).remove(row.storage_ref, row.company_id);
      const { error } = await admin
        .from('files')
        .update({ purged_at: now, storage_ref: `purged:${row.id}` })
        .eq('id', row.id);
      if (error) throw error;
      await logAccess(row.company_id, row.id, 'purge', row.storage_provider);
      purged += 1;
    } catch (error) {
      log.error('file could not be purged', { file: row.id, error });
    }
  }
  await admin.rpc('kd_grant_purge');
  return { trashed: trash.data?.length ?? 0, purged };
}
