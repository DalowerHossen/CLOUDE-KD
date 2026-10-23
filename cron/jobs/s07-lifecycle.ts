// path: cron/jobs/s07-lifecycle.ts
// Every 5 minutes: approvals for exports, build waiting export and backup files, scheduled backups, clean-up, closures.
import type { CronJobDefinition } from '@/types/contracts';
import {
  processClosures,
  processWaiting,
  runSchedules,
  syncExportApprovals,
} from '@/services/lifecycle/data';

export const job: CronJobDefinition = {
  name: 'lifecycle',
  schedule: '*/5 * * * *',
  handler: async () => {
    await syncExportApprovals();
    await processWaiting();
    await runSchedules();
    await processClosures();
  },
};
