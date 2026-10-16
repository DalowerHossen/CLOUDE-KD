// path: app/api/inventory/cogs/route.ts
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { cogsQuery } from '@/lib/stock/stock';
import { cogsReport } from '@/services/inventory/valuation';

export const GET = withApi(
  {
    id: 'stock.cogs',
    scope: 'tenant',
    permission: { action: 'inventory.costs', resourceType: 'stock' },
    query: cogsQuery,
  },
  async ({ actor, query }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await cogsReport(actor.companyId, query) };
  },
);
