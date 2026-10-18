// path: cron/jobs/s13-disputes.ts
// Every hour: the owner is alerted when a dispute answer is due in 72 hours, in 24 hours, and when it is overdue.
import type { CronJobDefinition } from '@/types/contracts';
import { runDisputeDeadlines } from '@/services/dispute/deadlines';

export const job: CronJobDefinition = {
  name: 'dispute-deadlines',
  schedule: '15 * * * *',
  handler: async () => {
    await runDisputeDeadlines();
  },
};
