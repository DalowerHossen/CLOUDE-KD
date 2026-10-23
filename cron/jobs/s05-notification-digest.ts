// path: cron/jobs/s05-notification-digest.ts
import type { CronJobDefinition } from '@/types/contracts';
import { sendDigests } from '@/services/notification/notification-service';

export const job: CronJobDefinition = {
  name: 'notification-digest',
  schedule: '5 6 * * *',
  handler: async () => {
    await sendDigests();
  },
};
