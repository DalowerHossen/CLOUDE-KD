// path: app/api/products/duplicates/route.ts
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { productDuplicateQuery } from '@/lib/catalog/products';
import { findProductDuplicates } from '@/services/product/products';

export const GET = withApi(
  {
    id: 'products.duplicates',
    scope: 'tenant',
    permission: { action: 'product.read', resourceType: 'product' },
    query: productDuplicateQuery,
  },
  async ({ actor, query }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await findProductDuplicates(actor.companyId, query) };
  },
);
