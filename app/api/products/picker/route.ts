// path: app/api/products/picker/route.ts
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { pickerQuery } from '@/lib/catalog/products';
import { pickProducts } from '@/services/product/search';

export const GET = withApi(
  {
    id: 'products.picker',
    scope: 'tenant',
    permission: { action: 'product.read', resourceType: 'product' },
    query: pickerQuery,
  },
  async ({ actor, query }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return {
      data: await pickProducts(actor.companyId, query.q, query.clientId ?? null, query.limit),
    };
  },
);
