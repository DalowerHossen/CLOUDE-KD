// path: cron/jobs/s09-batches.ts
// Every minute: works through the waiting items of invoice batches.
import type { CronJobDefinition } from '@/types/contracts';
import { processBatches } from '@/services/invoice/batch';

export const job: CronJobDefinition = {
  name: 'invoice-batches',
  schedule: '* * * * *',
  handler: async () => {
    await processBatches();
  },
};
