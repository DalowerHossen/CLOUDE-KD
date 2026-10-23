// path: app/api/public/v1/payments/[id]/route.ts
import { withPublicApi } from '@/lib/integrations/public-api';
import { idParams } from '@/lib/integrations/public-schemas';
import { getResource } from '@/services/publicapi/resources';

export const GET = withPublicApi(
  { id: 'public.payments.get', resource: 'payments', params: idParams },
  async ({ params, companyId, mode }) => ({
    data: await getResource({ companyId, mode }, 'payments', params.id),
  }),
);
