// path: cron/jobs/s09-overdue.ts
// Every hour at minute 17: invoices past their due date become overdue.
import type { CronJobDefinition } from '@/types/contracts';
import { sweepOverdue } from '@/services/invoice/payments';

export const job: CronJobDefinition = {
  name: 'invoice-overdue',
  schedule: '17 * * * *',
  handler: async () => {
    await sweepOverdue();
  },
};
