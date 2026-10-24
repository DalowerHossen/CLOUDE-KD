// path: cron/jobs/s16-messaging.ts
// Every minute: sends the messages that are due (after the quiet hours too), copies delivery and engagement, picks the winner of
// A/B tests that are due and finishes campaigns with nothing left to send.
import type { CronJobDefinition } from '@/types/contracts';
import { runCampaigns } from '@/services/messaging/campaigns';
import { runMessages } from '@/services/messaging/routing';

export const job: CronJobDefinition = {
  name: 'messaging',
  schedule: '* * * * *',
  handler: async () => {
    await runCampaigns();
    await runMessages();
  },
};
