// path: app/api/inventory/movements/route.ts
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { movementsQuery } from '@/lib/stock/stock';
import { listMovements } from '@/services/inventory/stock';

export const GET = withApi(
  {
    id: 'stock.movements',
    scope: 'tenant',
    permission: { action: 'inventory.read', resourceType: 'stock' },
    query: movementsQuery,
  },
  async ({ actor, query }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await listMovements(actor.companyId, query) };
  },
);
