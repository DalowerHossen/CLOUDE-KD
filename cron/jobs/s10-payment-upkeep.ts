// path: cron/jobs/s10-payment-upkeep.ts
// Every 5 minutes: finishes captured payments whose invoice update did not complete, and fails payments that never
// finished (the payer left during 3D Secure).
import type { CronJobDefinition } from '@/types/contracts';
import {
  expireAbandonedChallenges,
  expireStaleOpen,
  settleOrphans,
} from '@/services/payment/payments';

export const job: CronJobDefinition = {
  name: 'payment-upkeep',
  schedule: '*/5 * * * *',
  handler: async () => {
    await settleOrphans(50);
    await expireStaleOpen(100);
    await expireAbandonedChallenges(100);
  },
};
