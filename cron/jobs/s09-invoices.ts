// path: cron/jobs/s09-invoices.ts
// Every 5 minutes: send the invoices that the owner approved.
import type { CronJobDefinition } from '@/types/contracts';
import { syncInvoiceApprovals } from '@/services/invoice/send';

export const job: CronJobDefinition = {
  name: 'invoice-approvals',
  schedule: '*/5 * * * *',
  handler: async () => {
    await syncInvoiceApprovals();
  },
};
