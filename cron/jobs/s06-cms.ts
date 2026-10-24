// path: cron/jobs/s06-cms.ts
// Every five minutes: apply approval decisions, then publish scheduled pages that are due.
import type { CronJobDefinition } from '@/types/contracts';
import { releaseDue, syncApprovals } from '@/services/cms/cms-service';

export const job: CronJobDefinition = {
  name: 'cms-publish',
  schedule: '*/5 * * * *',
  handler: async () => {
    await syncApprovals();
    await releaseDue();
  },
};
