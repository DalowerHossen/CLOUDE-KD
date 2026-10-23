// path: cron/jobs/s09-snapshots.ts
// Every 10 minutes: sent invoices whose PDF snapshot is missing (a failed render at send time) get one.
import type { CronJobDefinition } from '@/types/contracts';
import { backfillSnapshots } from '@/services/invoice/snapshots';

export const job: CronJobDefinition = {
  name: 'invoice-snapshots',
  schedule: '*/10 * * * *',
  handler: async () => {
    await backfillSnapshots();
  },
};
