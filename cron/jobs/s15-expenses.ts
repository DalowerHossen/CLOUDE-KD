// path: cron/jobs/s15-expenses.ts
// Every day: makes the recurring expenses that are due, and publishes again the approved expenses whose event was missed.
import type { CronJobDefinition } from '@/types/contracts';
import { republishUnbooked } from '@/services/expense/expenses';
import { runDueRecurringExpenses } from '@/services/expense/recurring';

export const job: CronJobDefinition = {
  name: 'expense-recurring',
  schedule: '30 5 * * *',
  handler: async () => {
    await runDueRecurringExpenses();
    await republishUnbooked();
  },
};
