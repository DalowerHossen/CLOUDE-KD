// path: app/api/subscriptions/client/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { startClientSubscription } from '@/services/subscription/client-subscriptions';
import { listClientSubs } from '@/services/subscription/client-store';

export const GET = withApi(
  {
    id: 'client-subscriptions.list',
    scope: 'tenant',
    permission: { action: 'client_subscription.read', resourceType: 'client_subscription' },
    query: z.strictObject({
      status: z.enum(['trialing', 'active', 'paused', 'past_due', 'cancelled', 'ended']).optional(),
      clientId: z.string().uuid().optional(),
    }),
  },
  async ({ actor, query }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await listClientSubs(actor.companyId, query) };
  },
);

export const POST = withApi(
  {
    id: 'client-subscriptions.start',
    scope: 'tenant',
    permission: { action: 'client_subscription.manage', resourceType: 'client_subscription' },
    body: z.strictObject({
      clientId: z.string().uuid(),
      planId: z.string().uuid(),
      seats: z.number().int().min(1).max(10000).optional(),
    }),
    auditExempt: 'The subscription service writes the audit entry and the history.',
  },
  async ({ actor, body }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { status: 201, data: await startClientSubscription(actor, body) };
  },
);
