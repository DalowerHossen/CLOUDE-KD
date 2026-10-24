// path: app/api/payouts/queue/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { PAYOUT_STATUSES } from '@/lib/payment/payout';
import { listQueue } from '@/services/payout/payouts';

export const GET = withApi(
  {
    id: 'payouts.queue',
    scope: 'platform',
    networkContext: 'admin',
    permission: { action: 'payout.queue.manage', resourceType: 'payout' },
    query: z.strictObject({ status: z.enum(PAYOUT_STATUSES).optional() }),
  },
  async ({ actor, query }) => {
    if (!actor) throw new ForbiddenError();
    return { data: await listQueue(actor, query.status ? [query.status] : undefined) };
  },
);
