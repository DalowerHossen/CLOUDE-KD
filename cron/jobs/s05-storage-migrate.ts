// path: cron/jobs/s05-storage-migrate.ts
// Moves a few files of running provider migrations every minute; unfinished moves continue on the next tick.
import type { CronJobDefinition } from '@/types/contracts';
import { processMigrations } from '@/services/storage/migrate';

export const job: CronJobDefinition = {
  name: 'storage-migrate',
  schedule: '* * * * *',
  handler: async () => {
    await processMigrations(5);
  },
};
