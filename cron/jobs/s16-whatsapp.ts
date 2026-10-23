// path: cron/jobs/s16-whatsapp.ts
// Every minute: sends the WhatsApp rule runs that are due (delayed ones and any left pending) and one batch of each running
// campaign, within the daily limit.
import type { CronJobDefinition } from '@/types/contracts';
import { runCampaigns } from '@/services/whatsapp/campaigns';
import { runDueRuns } from '@/services/whatsapp/rules';

export const job: CronJobDefinition = {
  name: 'whatsapp-automation',
  schedule: '* * * * *',
  handler: async () => {
    await runDueRuns();
    await runCampaigns();
  },
};
