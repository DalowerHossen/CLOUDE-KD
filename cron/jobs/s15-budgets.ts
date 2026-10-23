// path: cron/jobs/s15-budgets.ts
// Every day: tells owners when an expense account has used 80 or 100 percent of its budget, and warns an owner whose cash is
// expected to fall below their level (at most once a week).
import type { CronJobDefinition } from '@/types/contracts';
import { runForecastAlerts } from '@/services/budget/forecast';
import { runBudgetAlerts } from '@/services/budget/variance';

export const job: CronJobDefinition = {
  name: 'budget-alerts',
  schedule: '45 5 * * *',
  handler: async () => {
    await runBudgetAlerts();
    await runForecastAlerts();
  },
};
