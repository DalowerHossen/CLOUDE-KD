// path: cron/jobs/s10-review-expiry.ts
// Every 10 minutes: voids the authorization of payments whose manual review hold ran out (REQ-VERIFY item 2).
import type { CronJobDefinition } from '@/types/contracts';
import { expireReviews } from '@/services/payment/reviews';

export const job: CronJobDefinition = {
  name: 'payment-review-expiry',
  schedule: '*/10 * * * *',
  handler: async () => {
    await expireReviews(100);
  },
};
