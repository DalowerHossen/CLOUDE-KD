// path: cron/jobs/s15-payroll.ts
// Every day: publishes the pay run events that were missed and makes the payslips that are missing.
import type { CronJobDefinition } from '@/types/contracts';
import { repairRuns } from '@/services/payroll/runs';

export const job: CronJobDefinition = {
  name: 'payroll-repair',
  schedule: '20 6 * * *',
  handler: async () => {
    await repairRuns();
  },
};
