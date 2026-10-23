// path: cron/jobs/s16-social-quarter.ts
// Every 15 minutes: approves the posts nobody answered in time (where the company set hours) and posts from the evergreen queue.
import type { CronJobDefinition } from '@/types/contracts';
import { runAutoApprove } from '@/services/social/approvals';
import { runEvergreen } from '@/services/social/evergreen';

export const job: CronJobDefinition = {
  name: 'social-quarter-hour',
  schedule: '*/15 * * * *',
  handler: async () => {
    await runAutoApprove();
    await runEvergreen();
  },
};
