// path: cron/jobs/s14-payouts.ts
// Every hour: runs the payout schedules that are due, then sends the approved payouts (and the retries that are due)
// to their partner.
import type { CronJobDefinition } from '@/types/contracts';
import { processDue } from '@/services/payout/payouts';
import { runSchedules } from '@/services/payout/schedule';

export const job: CronJobDefinition = {
  name: 'payouts',
  schedule: '20 * * * *',
  handler: async () => {
    await runSchedules();
    await processDue();
  },
};
