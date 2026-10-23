// path: app/api/subscriptions/client/[id]/pause/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { pauseClientSubscription } from '@/services/subscription/client-subscriptions';

export const POST = withApi(
  {
    id: 'client-subscriptions.pause',
    scope: 'tenant',
    permission: { action: 'client_subscription.manage', resourceType: 'client_subscription' },
    params: z.object({ id: z.string().uuid() }).strict(),
    body: z.strictObject({
      resumeOn: z
        .string()
        .regex(/^\\d{4}-\\d{2}-\\d{2}$/)
        .nullable()
        .default(null),
    }),
    auditExempt: 'The subscription service writes the audit entry and the history.',
  },
  async ({ actor, params, body }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await pauseClientSubscription(actor, params.id, body.resumeOn) };
  },
);
