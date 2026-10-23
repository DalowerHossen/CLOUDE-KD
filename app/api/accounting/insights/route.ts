// path: app/api/accounting/insights/route.ts
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { businessOverview } from '@/services/budget/insights';

export const GET = withApi(
  {
    id: 'accounting.insights.get',
    scope: 'tenant',
    permission: { action: 'accounting.read', resourceType: 'insight' },
  },
  async ({ actor }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await businessOverview(actor.companyId) };
  },
);
