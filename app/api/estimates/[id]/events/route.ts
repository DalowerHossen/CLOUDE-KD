// path: app/api/estimates/[id]/events/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { listEstimateEvents } from '@/services/estimate/estimates';

export const GET = withApi(
  {
    id: 'estimates.events',
    scope: 'tenant',
    permission: { action: 'estimate.read', resourceType: 'estimate' },
    params: z.object({ id: z.string().uuid() }).strict(),
  },
  async ({ actor, params: p }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await listEstimateEvents(actor.companyId, p.id) };
  },
);
