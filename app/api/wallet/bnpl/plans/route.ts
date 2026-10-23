// path: app/api/wallet/bnpl/plans/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { listPlans } from '@/services/bnpl/installments';

export const GET = withApi(
  {
    id: 'bnpl.plans',
    scope: 'tenant',
    permission: { action: 'client_subscription.read', resourceType: 'bnpl' },
    query: z.strictObject({
      status: z.enum(['active', 'completed', 'defaulted', 'cancelled']).optional(),
    }),
  },
  async ({ actor, query }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await listPlans(actor.companyId, query.status) };
  },
);
