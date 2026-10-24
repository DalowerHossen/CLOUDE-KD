// path: cron/jobs/s09-report-schedules.ts
// Every hour at minute 53: sends the scheduled reports whose day has come.
import type { CronJobDefinition } from '@/types/contracts';
import { runDueReportSchedules } from '@/services/report/schedules';

export const job: CronJobDefinition = {
  name: 'report-schedules',
  schedule: '53 * * * *',
  handler: async () => {
    await runDueReportSchedules();
  },
};
