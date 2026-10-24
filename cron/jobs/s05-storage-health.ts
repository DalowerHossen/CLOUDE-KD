// path: cron/jobs/s05-storage-health.ts
// Checks every connected Google Drive link every 15 minutes. A failing link is marked "error", so new files go to the
// platform storage until the link works again; a working link returns to "connected" by itself.
import type { CronJobDefinition } from '@/types/contracts';
import { InternalError } from '@/lib/errors';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { checkHealth } from '@/services/storage/resolver';

export const job: CronJobDefinition = {
  name: 'storage-health',
  schedule: '*/15 * * * *',
  handler: async () => {
    const { data, error } = await getAdminSupabase()
      .from('drive_connections')
      .select('company_id')
      .is('deleted_at', null)
      .neq('status', 'revoked');
    if (error) throw new InternalError(error);
    for (const row of data ?? []) await checkHealth(String(row.company_id));
  },
};
