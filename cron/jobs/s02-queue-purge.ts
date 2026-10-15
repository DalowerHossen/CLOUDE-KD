// path: cron/jobs/s02-queue-purge.ts
import type { CronJobDefinition } from '@/types/contracts';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { InternalError } from '@/lib/errors';

export const job: CronJobDefinition = {
  name: 'queues-purge',
  schedule: '17 3 * * *',
  handler: async () => {
    const { error } = await getAdminSupabase().rpc('kd_purge_queues');
    if (error) throw new InternalError(error);
  },
};
