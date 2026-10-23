// path: app/api/public/v1/automation/triggers/invoice-paid/route.ts
import { pollQuery } from '@/lib/integrations/automation-rules';
import { withPublicApi } from '@/lib/integrations/public-api';
import { pollTrigger } from '@/services/integration/automation';

/** The latest "invoice-paid" events, newest first. Each event has a stable id, so a poll never returns a copy of an event. */
export const GET = withPublicApi(
  { id: 'public.automation.invoice-paid', resource: 'invoices', query: pollQuery },
  async ({ query, companyId, mode, key }) => ({
    data: await pollTrigger({ companyId, mode, keyId: key.id }, 'invoice-paid', query),
  }),
);
