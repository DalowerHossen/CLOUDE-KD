// path: cron/jobs/s16-commerce.ts
// Every minute: the orders of the connected stores whose time has come (hourly and daily stores, and orders that failed and wait for
// their next try), one batch of 25.
import type { CronJobDefinition } from '@/types/contracts';
import { runDueOrders } from '@/services/integration/commerce-orders';

export const job: CronJobDefinition = {
  name: 'commerce-orders',
  schedule: '* * * * *',
  handler: async () => {
    await runDueOrders();
  },
};
