// path: app/api/inventory/barcode/route.ts
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { barcodeQuery } from '@/lib/stock/documents';
import { lookupCode } from '@/services/inventory/barcode';

export const GET = withApi(
  {
    id: 'stock.barcode',
    scope: 'tenant',
    permission: { action: 'inventory.read', resourceType: 'stock' },
    query: barcodeQuery,
  },
  async ({ actor, query }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await lookupCode(actor.companyId, query.code) };
  },
);
