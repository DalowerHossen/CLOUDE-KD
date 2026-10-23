// path: cron/jobs/s14-bnpl.ts
// Every day: checks the running installment plans. A plan whose parts are all paid is completed; a plan with too many late
// parts is marked defaulted and the owner is told.
import type { CronJobDefinition } from '@/types/contracts';
import { checkPlans } from '@/services/bnpl/installments';

export const job: CronJobDefinition = {
  name: 'bnpl-check',
  schedule: '20 6 * * *',
  handler: async () => {
    await checkPlans();
  },
};
