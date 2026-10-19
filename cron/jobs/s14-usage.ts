// path: cron/jobs/s14-usage.ts
// Every day: writes the true use of this month (and of last month on the first days of the month) into the usage
// records that the overage billing reads.
import type { CronJobDefinition } from '@/types/contracts';
import { currentPeriod, snapshotUsage } from '@/services/entitlement/usage';

export const job: CronJobDefinition = {
  name: 'plan-usage',
  schedule: '40 2 * * *',
  handler: async () => {
    const now = new Date();
    await snapshotUsage(currentPeriod(now));
    if (now.getUTCDate() <= 3)
      await snapshotUsage(
        currentPeriod(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 15))),
      );
  },
};
