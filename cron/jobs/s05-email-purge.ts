// path: cron/jobs/s05-email-purge.ts
import type { CronJobDefinition } from '@/types/contracts';
import { InternalError } from '@/lib/errors';
import { getAdminSupabase } from '@/lib/supabase/admin';

export const job: CronJobDefinition = {
  name: 'email-purge',
  schedule: '47 3 * * *',
  handler: async () => {
    const { error } = await getAdminSupabase().rpc('kd_email_purge');
    if (error) throw new InternalError(error);
  },
};
