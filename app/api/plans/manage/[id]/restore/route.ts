// path: app/api/plans/manage/[id]/restore/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { restorePlan } from '@/services/plan/plans';

export const POST = withApi(
  {
    id: 'plans.manage.restore',
    scope: 'platform',
    networkContext: 'admin',
    roles: ['super_admin'],
    permission: { action: 'plan.manage', resourceType: 'plan' },
    params: z.object({ id: z.string().uuid() }).strict(),
    body: z.strictObject({}),
    auditExempt: 'The plan service writes the audit entry and the plan history.',
  },
  async ({ actor, params }) => {
    if (!actor) throw new ForbiddenError();
    return { data: await restorePlan(actor, params.id) };
  },
);
