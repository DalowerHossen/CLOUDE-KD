// path: cron/jobs/s10-webhook-retry.ts
// Every minute: processes webhook deliveries that failed or were left half done. After the last attempt a delivery
// moves to the dead-letter list, which administrators see on the webhook page.
import type { CronJobDefinition } from '@/types/contracts';
import { retryDueWebhooks } from '@/services/payment/webhook-core';

export const job: CronJobDefinition = {
  name: 'payment-webhook-retry',
  schedule: '* * * * *',
  handler: async () => {
    await retryDueWebhooks(50);
  },
};
