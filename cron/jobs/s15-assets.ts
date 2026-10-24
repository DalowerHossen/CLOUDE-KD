// path: cron/jobs/s15-assets.ts
// Every month (and again each day until it succeeds): books the depreciation of the months that are not booked yet.
import type { CronJobDefinition } from '@/types/contracts';
import { runDepreciationAll } from '@/services/asset/depreciation';

export const job: CronJobDefinition = {
  name: 'asset-depreciation',
  schedule: '15 4 * * *',
  handler: async () => {
    await runDepreciationAll();
  },
};
