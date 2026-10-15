// path: cron/jobs/s02-worker-tick.ts
import type { CronJobDefinition } from '@/types/contracts';
import { runWorkerTick } from '@/workers/runner';

export const job: CronJobDefinition = {
  name: 'worker-tick',
  schedule: '* * * * *',
  handler: async () => {
    await runWorkerTick();
  },
};
