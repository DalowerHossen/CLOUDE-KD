// path: app/api/subscriptions/client/[id]/resume/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { resumeClientSubscription } from '@/services/subscription/client-subscriptions';

export const POST = withApi(
  {
    id: 'client-subscriptions.resume',
    scope: 'tenant',
    permission: { action: 'client_subscription.manage', resourceType: 'client_subscription' },
    params: z.object({ id: z.string().uuid() }).strict(),
    body: z.strictObject({}),
    auditExempt: 'The subscription service writes the audit entry and the history.',
  },
  async ({ actor, params }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await resumeClientSubscription(actor, params.id) };
  },
);
