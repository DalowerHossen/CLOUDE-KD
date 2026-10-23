// path: cron/jobs/s16-ocr.ts
// Every minute: queues the receipts that wait for reading (companies with OCR on) and reads one batch of due jobs.
import type { CronJobDefinition } from '@/types/contracts';
import { runOcr } from '@/services/ocr/jobs';

export const job: CronJobDefinition = {
  name: 'ocr-jobs',
  schedule: '* * * * *',
  handler: async () => {
    await runOcr();
  },
};
