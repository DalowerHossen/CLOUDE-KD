// path: cron/jobs/s16-social-hourly.ts
// Hourly: makes the posts for the coming days of every posting schedule and reads the numbers of recent Threads posts.
import type { CronJobDefinition } from '@/types/contracts';
import { refreshStats } from '@/services/social/analytics';
import { purgeExpiredConnects } from '@/services/social/meta-connect';
import { runSchedules } from '@/services/social/schedules';

export const job: CronJobDefinition = {
  name: 'social-hourly',
  schedule: '7 * * * *',
  handler: async () => {
    await runSchedules();
    await refreshStats();
    await purgeExpiredConnects();
  },
};
