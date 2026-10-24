// path: cron/jobs/s04-siem.ts
import type { CronJobDefinition } from '@/types/contracts';
import { forwardPending, runCorrelation } from '@/services/siem/siem-service';

export const job: CronJobDefinition = {
  name: 'siem-forward-and-correlate',
  schedule: '*/5 * * * *',
  handler: async () => {
    await runCorrelation();
    await forwardPending();
  },
};
