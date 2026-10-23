// path: app/api/public/v1/invoices/[id]/route.ts
import { withPublicApi } from '@/lib/integrations/public-api';
import { idParams } from '@/lib/integrations/public-schemas';
import { getResource } from '@/services/publicapi/resources';

export const GET = withPublicApi(
  { id: 'public.invoices.get', resource: 'invoices', params: idParams },
  async ({ params, companyId, mode }) => ({
    data: await getResource({ companyId, mode }, 'invoices', params.id),
  }),
);
