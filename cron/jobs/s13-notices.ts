// path: cron/jobs/s13-notices.ts
// Every morning: clients whose estimate ended in the last days get one "expired" note.
import type { CronJobDefinition } from '@/types/contracts';
import { sendExpiredEstimateNotes } from '@/services/portal/notices';

export const job: CronJobDefinition = {
  name: 'estimate-expired-notes',
  schedule: '40 6 * * *',
  handler: async () => {
    await sendExpiredEstimateNotes();
  },
};
