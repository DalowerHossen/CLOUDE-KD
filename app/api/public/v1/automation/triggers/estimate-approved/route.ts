// path: app/api/public/v1/automation/triggers/estimate-approved/route.ts
import { pollQuery } from '@/lib/integrations/automation-rules';
import { withPublicApi } from '@/lib/integrations/public-api';
import { pollTrigger } from '@/services/integration/automation';

/** The latest "estimate-approved" events, newest first. Each event has a stable id, so a poll never returns a copy of an event. */
export const GET = withPublicApi(
  { id: 'public.automation.estimate-approved', resource: 'estimates', query: pollQuery },
  async ({ query, companyId, mode, key }) => ({
    data: await pollTrigger({ companyId, mode, keyId: key.id }, 'estimate-approved', query),
  }),
);
