// path: app/api/plans/manage/[id]/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { planUpdateInput } from '@/lib/payment/plan-rules';
import { getPlanById, planHistory, updatePlan } from '@/services/plan/plans';

const params = z.object({ id: z.string().uuid() }).strict();

export const GET = withApi(
  {
    id: 'plans.manage.get',
    scope: 'platform',
    networkContext: 'admin',
    roles: ['super_admin'],
    permission: { action: 'plan.manage', resourceType: 'plan' },
    params,
    query: z.strictObject({}),
  },
  async ({ actor, params: p }) => {
    if (!actor) throw new ForbiddenError();
    return { data: { plan: await getPlanById(p.id), history: await planHistory(p.id) } };
  },
);

export const PUT = withApi(
  {
    id: 'plans.manage.update',
    scope: 'platform',
    networkContext: 'admin',
    roles: ['super_admin'],
    permission: { action: 'plan.manage', resourceType: 'plan' },
    params,
    body: z.object({ version: z.number().int().min(1), changes: planUpdateInput }).strict(),
    auditExempt: 'The plan service writes the audit entry and the plan history.',
  },
  async ({ actor, params: p, body }) => {
    if (!actor) throw new ForbiddenError();
    return { data: await updatePlan(actor, p.id, body.version, body.changes) };
  },
);
