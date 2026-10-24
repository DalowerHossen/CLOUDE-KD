// path: app/api/disputes/[id]/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { getDispute, listDisputeEvents, listEvidence } from '@/services/dispute/disputes';

const params = z.object({ id: z.string().uuid() }).strict();

export const GET = withApi(
  {
    id: 'disputes.get',
    scope: 'tenant',
    permission: { action: 'dispute.read', resourceType: 'dispute' },
    params,
  },
  async ({ actor, params: p }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    const [dispute, evidence, events] = await Promise.all([
      getDispute(actor.companyId, p.id),
      listEvidence(actor.companyId, p.id),
      listDisputeEvents(actor.companyId, p.id),
    ]);
    return { data: { dispute, evidence, events } };
  },
);
