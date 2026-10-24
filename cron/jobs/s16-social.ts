// path: cron/jobs/s16-social.ts
// Every minute: publishes the social posts whose time has come and finishes the posts that wait for their container.
import type { CronJobDefinition } from '@/types/contracts';
import { runDuePosts, runPendingPosts } from '@/services/social/posts';

export const job: CronJobDefinition = {
  name: 'social-publish',
  schedule: '* * * * *',
  handler: async () => {
    await runPendingPosts();
    await runDuePosts();
  },
};
