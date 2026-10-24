// path: cron/jobs/s08-purchasing.ts
// Every 5 minutes: apply the owner's decision on purchase orders that staff submitted.
import type { CronJobDefinition } from '@/types/contracts';
import { syncOrderApprovals } from '@/services/purchase/orders';

export const job: CronJobDefinition = {
  name: 'po-approvals',
  schedule: '*/5 * * * *',
  handler: async () => {
    await syncOrderApprovals();
  },
};
