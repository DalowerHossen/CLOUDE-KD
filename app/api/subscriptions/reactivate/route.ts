// path: app/api/subscriptions/reactivate/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { reactivateSubscription } from '@/services/subscription/platform';

export const POST = withApi(
  {
    id: 'subscriptions.reactivate',
    scope: 'tenant',
    permission: { action: 'subscription.manage', resourceType: 'subscription' },
    body: z.strictObject({}),
    auditExempt: 'The subscription service writes the audit entry and the subscription history.',
  },
  async ({ actor }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await reactivateSubscription(actor) };
  },
);
