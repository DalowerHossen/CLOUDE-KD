// path: cron/jobs/s13-approvals.ts
// Every five minutes: contracts that staff asked to send are sent once the owner approved, or returned with the reason.
import type { CronJobDefinition } from '@/types/contracts';
import { syncContractApprovals } from '@/services/contract/send-gate';

export const job: CronJobDefinition = {
  name: 'contract-approvals',
  schedule: '*/5 * * * *',
  handler: async () => {
    await syncContractApprovals();
  },
};
