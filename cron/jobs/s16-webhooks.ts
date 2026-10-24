// path: cron/jobs/s16-webhooks.ts
// Every minute: sends the webhook deliveries that are due (new ones and retries).
import type { CronJobDefinition } from '@/types/contracts';
import { runDue } from '@/services/webhookout/dispatch';

export const job: CronJobDefinition = {
  name: 'webhook-deliveries',
  schedule: '* * * * *',
  handler: async () => {
    await runDue();
  },
};
