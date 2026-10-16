// path: cron/jobs/s09-fx.ts
// Daily at 05:05 UTC: fetch exchange rates from the registered rate providers.
import type { CronJobDefinition } from '@/types/contracts';
import { syncProviderRates } from '@/services/fx/rates';

export const job: CronJobDefinition = {
  name: 'fx-rates',
  schedule: '5 5 * * *',
  handler: async () => {
    await syncProviderRates();
  },
};
