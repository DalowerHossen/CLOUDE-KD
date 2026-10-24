// path: app/api/public/v1/automation/summary/route.ts
import { withPublicApi } from '@/lib/integrations/public-api';
import { invoiceSummary } from '@/services/integration/automation';

/** Invoice counts and the amount still owed, from the latest 100 invoices. */
export const GET = withPublicApi(
  { id: 'public.automation.summary', resource: 'invoices' },
  async ({ companyId, mode, key }) => ({
    data: await invoiceSummary({ companyId, mode, keyId: key.id }),
  }),
);
