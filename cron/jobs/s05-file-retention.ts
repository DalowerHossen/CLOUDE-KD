// path: cron/jobs/s05-file-retention.ts
import type { CronJobDefinition } from '@/types/contracts';
import { runRetention } from '@/services/storage/retention';

export const job: CronJobDefinition = {
  name: 'file-retention',
  schedule: '37 2 * * *',
  handler: async () => {
    await runRetention();
  },
};
