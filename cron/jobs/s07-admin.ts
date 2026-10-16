// path: cron/jobs/s07-admin.ts
// Every 5 minutes: apply the approval decisions for suspending and reactivating users and tenants.
import type { CronJobDefinition } from '@/types/contracts';
import { syncAdminActions } from '@/services/company/admin';

export const job: CronJobDefinition = {
  name: 'admin-actions',
  schedule: '*/5 * * * *',
  handler: async () => {
    await syncAdminActions();
  },
};
