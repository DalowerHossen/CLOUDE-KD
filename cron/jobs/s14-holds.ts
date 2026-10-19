// path: cron/jobs/s14-holds.ts
// Every hour: releases the holds that are due (held money becomes available), settles the payments that waited because
// the company could not be settled, and cuts the settlement reports of cycles that have ended.
import type { CronJobDefinition } from '@/types/contracts';
import { releaseDueHolds, settleWaiting } from '@/services/mor/holds';
import { closeSettlements } from '@/services/mor/reports';

export const job: CronJobDefinition = {
  name: 'wallet-holds',
  schedule: '5 * * * *',
  handler: async () => {
    await settleWaiting();
    await releaseDueHolds();
    await closeSettlements();
  },
};
