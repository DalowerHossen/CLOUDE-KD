// path: cron/jobs/s04-tor-list.ts
import type { CronJobDefinition } from '@/types/contracts';
import { refreshTorList } from '@/services/security/tor-list';

export const job: CronJobDefinition = {
  name: 'tor-list-refresh',
  schedule: '11 */6 * * *',
  handler: async () => {
    await refreshTorList();
  },
};
