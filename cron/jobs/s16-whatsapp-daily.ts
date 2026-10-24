// path: cron/jobs/s16-whatsapp-daily.ts
// Every day: makes a WhatsApp rule run for each open invoice that falls due in the number of days of a due-date rule.
import type { CronJobDefinition } from '@/types/contracts';
import { sweepDueSoon } from '@/services/whatsapp/rules';

export const job: CronJobDefinition = {
  name: 'whatsapp-due-soon',
  schedule: '17 8 * * *',
  handler: async () => {
    await sweepDueSoon();
  },
};
