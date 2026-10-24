// path: app/api/public/v1/payments/route.ts
import { withPublicApi } from '@/lib/integrations/public-api';
import { paymentsQuery } from '@/lib/integrations/public-schemas';
import { listResource } from '@/services/publicapi/resources';

export const GET = withPublicApi(
  { id: 'public.payments.list', resource: 'payments', query: paymentsQuery },
  async ({ query, companyId, mode }) => {
    const page = await listResource({ companyId, mode }, 'payments', query);
    return { data: page.items, nextCursor: page.nextCursor };
  },
);
