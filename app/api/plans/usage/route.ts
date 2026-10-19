// path: app/api/plans/usage/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { meters, paywall } from '@/services/entitlement/usage';
import { entitlementsOf } from '@/services/entitlement/entitlement';

/** The usage meters of the company, and the upgrade prompt for one locked feature when `feature` is given. */
export const GET = withApi(
  {
    id: 'plans.usage',
    scope: 'tenant',
    permission: { action: 'plan.usage.read', resourceType: 'plan' },
    query: z.strictObject({
      feature: z
        .string()
        .regex(/^[a-z][a-z0-9_.]{1,60}$/)
        .optional(),
    }),
  },
  async ({ actor, query }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    const [plan, list, gate] = await Promise.all([
      entitlementsOf(actor.companyId),
      meters(actor.companyId),
      query.feature ? paywall(actor.companyId, query.feature) : Promise.resolve(null),
    ]);
    return { data: { plan: plan.slug, meters: list, paywall: gate } };
  },
);
