// path: app/api/subscriptions/client/plans/[id]/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { clientPlanUpdate } from '@/lib/payment/client-subscription-rules';
import { updateClientPlan } from '@/services/subscription/client-plans';

export const PUT = withApi(
  {
    id: 'client-plans.update',
    scope: 'tenant',
    permission: { action: 'client_subscription.manage', resourceType: 'client_subscription_plan' },
    params: z.object({ id: z.string().uuid() }).strict(),
    body: z.object({ version: z.number().int().min(1), changes: clientPlanUpdate }).strict(),
    auditExempt: 'The plan service writes the audit entry.',
  },
  async ({ actor, params, body }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await updateClientPlan(actor, params.id, body.version, body.changes) };
  },
);
