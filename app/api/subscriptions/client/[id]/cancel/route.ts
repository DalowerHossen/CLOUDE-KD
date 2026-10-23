// path: app/api/subscriptions/client/[id]/cancel/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { plain } from '@/lib/crm/clients';
import { ForbiddenError } from '@/lib/errors';
import { cancelClientSubscription } from '@/services/subscription/client-subscriptions';

export const POST = withApi(
  {
    id: 'client-subscriptions.cancel',
    scope: 'tenant',
    permission: { action: 'client_subscription.manage', resourceType: 'client_subscription' },
    params: z.object({ id: z.string().uuid() }).strict(),
    body: z.strictObject({ reason: plain(3, 300), immediately: z.boolean().default(false) }),
    auditExempt: 'The subscription service writes the audit entry and the history.',
  },
  async ({ actor, params, body }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return {
      data: await cancelClientSubscription(actor, params.id, body.reason, body.immediately),
    };
  },
);
