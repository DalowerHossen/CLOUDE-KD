// path: cron/jobs/s15-recurring.ts
// Every day: makes the recurring journal entries that are due (as drafts, or posted when the entry says so).
import type { CronJobDefinition } from '@/types/contracts';
import { runDueRecurring } from '@/services/accounting/recurring';

export const job: CronJobDefinition = {
  name: 'accounting-recurring',
  schedule: '10 5 * * *',
  handler: async () => {
    await runDueRecurring();
  },
};
