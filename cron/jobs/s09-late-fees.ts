// path: cron/jobs/s09-late-fees.ts
// Every day at 01:23 UTC: proposes the late fees that are due (or applies them for companies that chose that).
import type { CronJobDefinition } from '@/types/contracts';
import { runLateFees } from '@/services/invoice/late-fees';

export const job: CronJobDefinition = {
  name: 'invoice-late-fees',
  schedule: '23 1 * * *',
  handler: async () => {
    await runLateFees();
  },
};
