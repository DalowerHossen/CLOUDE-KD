// path: services/storage/access-log.ts
// Who uploaded, opened or removed which file (features 3293, 3667). Stored in the append-only file_access_log.
import 'server-only';
import { createLogger } from '@/lib/logger';
import { getContext } from '@/lib/logger/correlation';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { readRequestMeta } from '@/services/audit/request-meta';
import type { StorageProvider } from '@/types/contracts';

const log = createLogger({ component: 'file-access' });

export type FileAction =
  'upload' | 'download' | 'signed_url' | 'delete' | 'restore' | 'migrate' | 'duplicate' | 'purge';

/** Never blocks the operation: a failed log write is reported as an error and the file action goes on. */
export async function logAccess(
  companyId: string | null,
  fileId: string,
  action: FileAction,
  provider: StorageProvider | null,
): Promise<void> {
  try {
    const meta = await readRequestMeta().catch(() => null);
    const { error } = await getAdminSupabase()
      .from('file_access_log')
      .insert({
        company_id: companyId,
        file_id: fileId,
        action,
        actor_user_id: getContext()?.actorId ?? null,
        ip_hash: meta?.ipHash ?? null,
        provider,
      });
    if (error) throw error;
  } catch (error) {
    log.error('file access could not be recorded', { action, error });
  }
}
