// path: cron/jobs/s04-alert-escalation.ts
import type { CronJobDefinition } from '@/types/contracts';
import { processEscalations } from '@/services/alerting/alert-service';

export const job: CronJobDefinition = {
  name: 'alert-escalation',
  schedule: '*/5 * * * *',
  handler: async () => {
    await processEscalations();
  },
};
