// path: cron/jobs/s02-audit-integrity.ts
import type { CronJobDefinition } from '@/types/contracts';
import { runAuditIntegrity } from '@/services/audit/integrity';

export const job: CronJobDefinition = {
  name: 'audit-integrity',
  schedule: '*/15 * * * *',
  handler: async () => {
    await runAuditIntegrity();
  },
};
