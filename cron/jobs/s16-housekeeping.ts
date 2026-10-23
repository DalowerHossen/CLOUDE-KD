// path: cron/jobs/s16-housekeeping.ts
// Every day: tells companies about API keys that are about to expire, removes old rate limit counters and usage rows, and
// cancels imports that were never started. Each step can be repeated safely.
import type { CronJobDefinition } from '@/types/contracts';
import { runHousekeeping } from '@/services/integration/housekeeping';

export const job: CronJobDefinition = {
  name: 'integrations-housekeeping',
  schedule: '43 3 * * *',
  handler: async () => {
    await runHousekeeping();
  },
};
