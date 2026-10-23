// path: cron/jobs/s05-email-queue.ts
// Sends due messages every minute: new ones that `enqueue` scheduled and retries of earlier failures.
import type { CronJobDefinition } from '@/types/contracts';
import { processQueue } from '@/services/email/sender';

export const job: CronJobDefinition = {
  name: 'email-queue',
  schedule: '* * * * *',
  handler: async () => {
    await processQueue(50);
  },
};
