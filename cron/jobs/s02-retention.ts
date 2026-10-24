// path: cron/jobs/s02-retention.ts
import type { CronJobDefinition } from '@/types/contracts';
import { runRetention } from '@/lib/compliance/retention';

export const job: CronJobDefinition = {
  name: 'retention-enforce',
  schedule: '43 2 * * *',
  handler: async () => {
    await runRetention();
  },
};
