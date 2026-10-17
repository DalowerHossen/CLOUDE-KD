// path: cron/jobs/s09-time.ts
// Every hour at minute 41: time that was claimed for an invoice but never linked to one is given back.
import type { CronJobDefinition } from '@/types/contracts';
import { releaseStaleClaims } from '@/services/project/release';

export const job: CronJobDefinition = {
  name: 'time-release-claims',
  schedule: '41 * * * *',
  handler: async () => {
    await releaseStaleClaims();
  },
};
