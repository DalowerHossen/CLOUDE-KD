// path: cron/jobs/s16-migration.ts
// Every minute: one batch of 100 rows for each running import, and one batch of 50 records for each rollback.
import type { CronJobDefinition } from '@/types/contracts';
import { runMigrations } from '@/services/migration/runner';

export const job: CronJobDefinition = {
  name: 'migration-jobs',
  schedule: '* * * * *',
  handler: async () => {
    await runMigrations();
  },
};
