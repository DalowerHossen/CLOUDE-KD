// path: app/api/public/v1/automation/triggers/client-created/route.ts
import { pollQuery } from '@/lib/integrations/automation-rules';
import { withPublicApi } from '@/lib/integrations/public-api';
import { pollTrigger } from '@/services/integration/automation';

/** The latest "client-created" events, newest first. Each event has a stable id, so a poll never returns a copy of an event. */
export const GET = withPublicApi(
  { id: 'public.automation.client-created', resource: 'clients', query: pollQuery },
  async ({ query, companyId, mode, key }) => ({
    data: await pollTrigger({ companyId, mode, keyId: key.id }, 'client-created', query),
  }),
);
