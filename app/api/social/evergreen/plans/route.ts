// path: app/api/social/evergreen/plans/route.ts
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { evergreenPlanInput } from '@/lib/social/schedule';
import { listPlans, savePlan } from '@/services/social/evergreen';

export const GET = withApi(
  {
    id: 'social.evergreen.plans',
    scope: 'tenant',
    permission: { action: 'social.read', resourceType: 'social_evergreen_plan' },
  },
  async ({ actor }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await listPlans(actor.companyId) };
  },
);

/** Sets how often an account posts from the queue. */
export const PUT = withApi(
  {
    id: 'social.evergreen.plan_save',
    scope: 'tenant',
    permission: { action: 'social.post', resourceType: 'social_evergreen_plan' },
    body: evergreenPlanInput,
    auditExempt: 'The evergreen service writes the audit entry.',
  },
  async ({ actor, body }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await savePlan(actor, body) };
  },
);
