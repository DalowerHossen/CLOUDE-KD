// path: app/api/plans/manage/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { planInput } from '@/lib/payment/plan-rules';
import { createPlan, listPlans } from '@/services/plan/plans';

export const GET = withApi(
  {
    id: 'plans.manage.list',
    scope: 'platform',
    networkContext: 'admin',
    roles: ['super_admin'],
    permission: { action: 'plan.manage', resourceType: 'plan' },
    query: z.strictObject({}),
  },
  async ({ actor }) => {
    if (!actor) throw new ForbiddenError();
    return { data: await listPlans({ includeArchived: true }) };
  },
);

export const POST = withApi(
  {
    id: 'plans.manage.create',
    scope: 'platform',
    networkContext: 'admin',
    roles: ['super_admin'],
    permission: { action: 'plan.manage', resourceType: 'plan' },
    body: planInput,
    auditExempt: 'The plan service writes the audit entry and the plan history.',
  },
  async ({ actor, body }) => {
    if (!actor) throw new ForbiddenError();
    return { status: 201, data: await createPlan(actor, body) };
  },
);
