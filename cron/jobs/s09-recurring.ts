// path: cron/jobs/s09-recurring.ts
// Every 30 minutes: makes the recurring invoices that are due (each company on its own calendar day).
import type { CronJobDefinition } from '@/types/contracts';
import { runDueSchedules } from '@/services/invoice/recurring';

export const job: CronJobDefinition = {
  name: 'invoice-recurring',
  schedule: '*/30 * * * *',
  handler: async () => {
    await runDueSchedules();
  },
};
