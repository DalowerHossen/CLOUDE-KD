// path: cron/jobs/s15-tax.ts
// Every day: reminds the owner of tax deadlines that are coming (once) and that are due today (once).
import type { CronJobDefinition } from '@/types/contracts';
import { runTaxReminders } from '@/services/taxfiling/filing';

export const job: CronJobDefinition = {
  name: 'tax-deadline-reminders',
  schedule: '50 5 * * *',
  handler: async () => {
    await runTaxReminders();
  },
};
