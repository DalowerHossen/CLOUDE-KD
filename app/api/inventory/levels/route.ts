// path: app/api/inventory/levels/route.ts
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { levelsQuery } from '@/lib/stock/stock';
import { listLevels } from '@/services/inventory/stock';

export const GET = withApi(
  {
    id: 'stock.levels',
    scope: 'tenant',
    permission: { action: 'inventory.read', resourceType: 'stock' },
    query: levelsQuery,
  },
  async ({ actor, query }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await listLevels(actor.companyId, query) };
  },
);
