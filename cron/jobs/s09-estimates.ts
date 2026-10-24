// path: cron/jobs/s09-estimates.ts
// Every night: estimates past their valid-until date become expired.
import type { CronJobDefinition } from '@/types/contracts';
import { expireEstimates } from '@/services/estimate/estimates';

export const job: CronJobDefinition = {
  name: 'estimate-expiry',
  schedule: '5 0 * * *',
  handler: async () => {
    await expireEstimates();
  },
};
