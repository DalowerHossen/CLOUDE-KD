// path: cron/jobs/s14-client-billing.ts
// Every hour: resumes paused client subscriptions that are due, bills the cycles that are due (the invoice is made and sent
// through the invoice service), checks unpaid subscription invoices and sends renewal reminders to the owner.
import type { CronJobDefinition } from '@/types/contracts';
import { runClientBilling } from '@/services/subscription/client-billing';

export const job: CronJobDefinition = {
  name: 'client-billing',
  schedule: '50 * * * *',
  handler: async () => {
    await runClientBilling();
  },
};
