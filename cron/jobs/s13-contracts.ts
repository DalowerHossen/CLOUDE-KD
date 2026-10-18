// path: cron/jobs/s13-contracts.ts
// Every morning: contracts past their signing date expire, silent signers get a reminder, and the owner is told about
// contracts that are about to end. A fully signed contract whose PDF is still missing is finished here too.
import type { CronJobDefinition } from '@/types/contracts';
import { runContractCycle } from '@/services/contract/send';
import { finalizePending } from '@/services/esign/finalize';

export const job: CronJobDefinition = {
  name: 'contract-cycle',
  schedule: '20 6 * * *',
  handler: async () => {
    await runContractCycle();
    await finalizePending();
  },
};
