// path: app/api/public/v1/automation/triggers/payment-received/route.ts
import { pollQuery } from '@/lib/integrations/automation-rules';
import { withPublicApi } from '@/lib/integrations/public-api';
import { pollTrigger } from '@/services/integration/automation';

/** The latest "payment-received" events, newest first. Each event has a stable id, so a poll never returns a copy of an event. */
export const GET = withPublicApi(
  { id: 'public.automation.payment-received', resource: 'payments', query: pollQuery },
  async ({ query, companyId, mode, key }) => ({
    data: await pollTrigger({ companyId, mode, keyId: key.id }, 'payment-received', query),
  }),
);
