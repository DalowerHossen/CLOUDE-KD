// path: cron/jobs/s08-inventory.ts
// Every day at 06:10 UTC: tell companies about batches that expire soon or already expired.
import type { CronJobDefinition } from '@/types/contracts';
import { notifyExpiring } from '@/services/inventory/valuation';

export const job: CronJobDefinition = {
  name: 'stock-expiry',
  schedule: '10 6 * * *',
  handler: async () => {
    await notifyExpiring();
  },
};
