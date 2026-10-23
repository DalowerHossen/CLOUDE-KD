// path: cron/jobs/s07-domains.ts
// Every 30 minutes: check the DNS records and certificates of custom domains that were not checked for six hours.
import type { CronJobDefinition } from '@/types/contracts';
import { checkDueDomains } from '@/services/domain/domains';

export const job: CronJobDefinition = {
  name: 'domain-check',
  schedule: '*/30 * * * *',
  handler: async () => {
    await checkDueDomains();
  },
};
