// path: app/api/disputes/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { disputeStats, listDisputes } from '@/services/dispute/disputes';
import { DISPUTE_STATUSES } from '@/services/dispute/status';

export const GET = withApi(
  {
    id: 'disputes.list',
    scope: 'tenant',
    permission: { action: 'dispute.read', resourceType: 'dispute' },
    query: z.strictObject({ status: z.enum(DISPUTE_STATUSES).optional() }),
  },
  async ({ actor, query }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    const [rows, stats] = await Promise.all([
      listDisputes(actor.companyId, { status: query.status }),
      disputeStats(actor.companyId),
    ]);
    return { data: { rows, stats } };
  },
);
