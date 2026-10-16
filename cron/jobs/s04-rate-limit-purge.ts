// path: cron/jobs/s04-rate-limit-purge.ts
import type { CronJobDefinition } from '@/types/contracts';
import { InternalError } from '@/lib/errors';
import { getAdminSupabase } from '@/lib/supabase/admin';

export const job: CronJobDefinition = {
  name: 'rate-limits-purge',
  schedule: '23 * * * *',
  handler: async () => {
    const { error } = await getAdminSupabase().rpc('kd_rate_limit_purge');
    if (error) throw new InternalError(error);
  },
};
