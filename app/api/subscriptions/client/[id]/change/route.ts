// path: app/api/subscriptions/client/[id]/change/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { changeClientSubscription } from '@/services/subscription/client-subscriptions';

export const POST = withApi(
  {
    id: 'client-subscriptions.change',
    scope: 'tenant',
    permission: { action: 'client_subscription.manage', resourceType: 'client_subscription' },
    params: z.object({ id: z.string().uuid() }).strict(),
    body: z.strictObject({
      planId: z.string().uuid().optional(),
      seats: z.number().int().min(1).max(10000).optional(),
    }),
    auditExempt: 'The subscription service writes the audit entry and the history.',
  },
  async ({ actor, params, body }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await changeClientSubscription(actor, params.id, body) };
  },
);
