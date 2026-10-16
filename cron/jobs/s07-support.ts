// path: cron/jobs/s07-support.ts
// Every 10 minutes: close solved tickets that stayed quiet and warn about late first answers.
import type { CronJobDefinition } from '@/types/contracts';
import { sweepTickets } from '@/services/support/tickets';

export const job: CronJobDefinition = {
  name: 'support-sweep',
  schedule: '*/10 * * * *',
  handler: async () => {
    await sweepTickets();
  },
};
