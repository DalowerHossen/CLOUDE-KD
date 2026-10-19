// path: app/api/plans/manage/[id]/entitlements/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { entitlementsInput } from '@/lib/payment/plan-rules';
import { setEntitlements } from '@/services/plan/plans';

export const PUT = withApi(
  {
    id: 'plans.manage.entitlements',
    scope: 'platform',
    networkContext: 'admin',
    roles: ['super_admin'],
    permission: { action: 'plan.manage', resourceType: 'plan' },
    params: z.object({ id: z.string().uuid() }).strict(),
    body: entitlementsInput,
    auditExempt: 'The plan service writes the audit entry and the plan history.',
  },
  async ({ actor, params, body }) => {
    if (!actor) throw new ForbiddenError();
    return { data: await setEntitlements(actor, params.id, body) };
  },
);
