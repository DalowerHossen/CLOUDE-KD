// path: cron/jobs/s02-approval-escalation.ts
import type { CronJobDefinition } from '@/types/contracts';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { InternalError } from '@/lib/errors';

export const job: CronJobDefinition = {
  name: 'approvals-escalate',
  schedule: '*/5 * * * *',
  handler: async () => {
    const { error } = await getAdminSupabase().rpc('kd_approval_escalate');
    if (error) throw new InternalError(error);
  },
};
