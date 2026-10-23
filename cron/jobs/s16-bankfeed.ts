// path: cron/jobs/s16-bankfeed.ts
// Every hour: the bank links whose last sync is older than 12 hours (or that never synced), ten at a time. Webhooks bring new
// lines sooner; this job is the safety net, so a missed webhook costs half a day at most.
import type { CronJobDefinition } from '@/types/contracts';
import { runDueSyncs } from '@/services/bankfeed/sync';

export const job: CronJobDefinition = {
  name: 'bankfeed-sync',
  schedule: '17 * * * *',
  handler: async () => {
    await runDueSyncs();
  },
};
