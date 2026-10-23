// path: app/api/subscriptions/client/plans/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { clientPlanInput } from '@/lib/payment/client-subscription-rules';
import { createClientPlan, listClientPlans } from '@/services/subscription/client-plans';

export const GET = withApi(
  {
    id: 'client-plans.list',
    scope: 'tenant',
    permission: { action: 'client_subscription.read', resourceType: 'client_subscription_plan' },
    query: z.strictObject({ all: z.enum(['true', 'false']).default('false') }),
  },
  async ({ actor, query }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await listClientPlans(actor.companyId, query.all === 'true') };
  },
);

export const POST = withApi(
  {
    id: 'client-plans.create',
    scope: 'tenant',
    permission: { action: 'client_subscription.manage', resourceType: 'client_subscription_plan' },
    body: clientPlanInput,
    auditExempt: 'The plan service writes the audit entry.',
  },
  async ({ actor, body }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { status: 201, data: await createClientPlan(actor, body) };
  },
);
