// path: cron/jobs/s07-kyc.ts
// Every 15 minutes: apply final approvals of business verifications, warn before they end, mark ended ones.
import type { CronJobDefinition } from '@/types/contracts';
import { processKycExpiry, syncKycApprovals } from '@/services/kyc/review';

export const job: CronJobDefinition = {
  name: 'kyc-sync',
  schedule: '*/15 * * * *',
  handler: async () => {
    await syncKycApprovals();
    await processKycExpiry();
  },
};
