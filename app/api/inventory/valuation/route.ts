// path: app/api/inventory/valuation/route.ts
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { valuationReport } from '@/services/inventory/valuation';

export const GET = withApi(
  {
    id: 'stock.valuation',
    scope: 'tenant',
    permission: { action: 'inventory.costs', resourceType: 'stock' },
  },
  async ({ actor }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await valuationReport(actor.companyId) };
  },
);
