// path: cron/jobs/s14-subscriptions.ts
// Every hour: makes renewal invoices and reminders, rolls paid periods forward, ends cancelled subscriptions and
// unpaid trials, then runs the payment attempts, the grace period and the move to the free plan.
import type { CronJobDefinition } from '@/types/contracts';
import { runDunning } from '@/services/subscription/dunning';
import { runRenewals } from '@/services/subscription/platform';

export const job: CronJobDefinition = {
  name: 'subscriptions',
  schedule: '35 * * * *',
  handler: async () => {
    await runRenewals();
    await runDunning();
  },
};
