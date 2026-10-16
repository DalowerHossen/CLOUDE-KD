// path: cron/jobs/s05-upload-purge.ts
import type { CronJobDefinition } from '@/types/contracts';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { InternalError } from '@/lib/errors';

export const job: CronJobDefinition = {
  name: 'upload-session-purge',
  schedule: '23 * * * *',
  handler: async () => {
    const { error } = await getAdminSupabase().rpc('kd_upload_purge');
    if (error) throw new InternalError(error);
  },
};
