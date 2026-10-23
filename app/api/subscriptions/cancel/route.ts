// path: app/api/subscriptions/cancel/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { plain } from '@/lib/crm/clients';
import { ForbiddenError } from '@/lib/errors';
import { cancelSubscription } from '@/services/subscription/platform';

export const POST = withApi(
  {
    id: 'subscriptions.cancel',
    scope: 'tenant',
    permission: { action: 'subscription.manage', resourceType: 'subscription' },
    body: z.strictObject({ reason: plain(3, 300) }),
    auditExempt: 'The subscription service writes the audit entry and the subscription history.',
  },
  async ({ actor, body }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await cancelSubscription(actor, body.reason) };
  },
);
