// path: cron/jobs/s16-processor-health.ts
// Every 10 minutes: checks the enabled payment processors that are due, records the result and switches off a processor that
// failed the allowed number of checks in a row. If this job cannot run, nothing is switched off.
import type { CronJobDefinition } from '@/types/contracts';
import { createLogger } from '@/lib/logger';
import { runHealthCycle } from '@/services/payment/health';

const log = createLogger({ job: 'processor-health' });

export const job: CronJobDefinition = {
  name: 'processor-health',
  schedule: '*/10 * * * *',
  handler: async () => {
    const summary = await runHealthCycle();
    log.info('processor health cycle finished', { ...summary });
  },
};
