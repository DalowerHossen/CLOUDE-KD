// path: cron/jobs/s13-contracts.ts
// Every morning: contracts past their signing date expire, silent signers get a reminder, and the owner is told about
// contracts that are about to end.
import type { CronJobDefinition } from '@/types/contracts';
import { runContractCycle } from '@/services/contract/send';

export const job: CronJobDefinition = {
  name: 'contract-cycle',
  schedule: '20 6 * * *',
  handler: async () => {
    await runContractCycle();
  },
};
