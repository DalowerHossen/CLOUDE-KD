// path: cron/jobs/s06-blog.ts
// Every five minutes: apply approval decisions for blog posts, then publish scheduled posts that are due.
import type { CronJobDefinition } from '@/types/contracts';
import { releaseDueBlog, syncBlogApprovals } from '@/services/blog/admin';

export const job: CronJobDefinition = {
  name: 'blog-publish',
  schedule: '*/5 * * * *',
  handler: async () => {
    await syncBlogApprovals();
    await releaseDueBlog();
  },
};
