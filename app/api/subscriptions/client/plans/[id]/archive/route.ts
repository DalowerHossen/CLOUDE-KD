// path: app/api/subscriptions/client/plans/[id]/archive/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { archiveClientPlan } from '@/services/subscription/client-plans';

export const POST = withApi(
  {
    id: 'client-plans.archive',
    scope: 'tenant',
    permission: { action: 'client_subscription.manage', resourceType: 'client_subscription_plan' },
    params: z.object({ id: z.string().uuid() }).strict(),
    body: z.strictObject({}),
    auditExempt: 'The plan service writes the audit entry.',
  },
  async ({ actor, params }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await archiveClientPlan(actor, params.id) };
  },
);
