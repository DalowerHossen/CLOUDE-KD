// path: app/api/public/v1/estimates/[id]/route.ts
import { withPublicApi } from '@/lib/integrations/public-api';
import { idParams } from '@/lib/integrations/public-schemas';
import { getResource } from '@/services/publicapi/resources';

export const GET = withPublicApi(
  { id: 'public.estimates.get', resource: 'estimates', params: idParams },
  async ({ params, companyId, mode }) => ({
    data: await getResource({ companyId, mode }, 'estimates', params.id),
  }),
);
