// path: cron/jobs/s08-clients.ts
// Every 5 minutes: apply the owner's decisions on privacy requests that staff made.
import type { CronJobDefinition } from '@/types/contracts';
import { syncPrivacyRequests } from '@/services/client/privacy';

export const job: CronJobDefinition = {
  name: 'client-privacy',
  schedule: '*/5 * * * *',
  handler: async () => {
    await syncPrivacyRequests();
  },
};
