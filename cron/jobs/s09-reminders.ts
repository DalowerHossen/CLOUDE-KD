// path: cron/jobs/s09-reminders.ts
// Every hour at minute 7: sends the payment reminders that are due (each company at its own quiet hours and days).
import type { CronJobDefinition } from '@/types/contracts';
import { runReminders } from '@/services/invoice/reminders';

export const job: CronJobDefinition = {
  name: 'invoice-reminders',
  schedule: '7 * * * *',
  handler: async () => {
    await runReminders();
  },
};
