// path: app/api/retention/offer/route.ts
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { offerQuerySchema } from '@/lib/platform/retention';
import { offerFor } from '@/services/platform/retention';

export const GET = withApi(
  {
    id: 'retention.offer',
    scope: 'tenant',
    permission: { action: 'subscription.manage', resourceType: 'subscription' },
    query: offerQuerySchema,
  },
  async ({ actor, query }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await offerFor(query.trigger, query.reasonCode) };
  },
);
