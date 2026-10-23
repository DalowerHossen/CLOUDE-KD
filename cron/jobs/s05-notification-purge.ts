// path: cron/jobs/s05-notification-purge.ts
import type { CronJobDefinition } from '@/types/contracts';
import { InternalError } from '@/lib/errors';
import { getAdminSupabase } from '@/lib/supabase/admin';

export const job: CronJobDefinition = {
  name: 'notification-purge',
  schedule: '17 4 * * *',
  handler: async () => {
    const { error } = await getAdminSupabase().rpc('kd_notification_purge');
    if (error) throw new InternalError(error);
  },
};
