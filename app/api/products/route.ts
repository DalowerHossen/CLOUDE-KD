// path: app/api/products/route.ts
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { productCreateSchema, productListQuery } from '@/lib/catalog/products';
import { createProduct } from '@/services/product/products';
import { searchProducts } from '@/services/product/search';

export const GET = withApi(
  {
    id: 'products.list',
    scope: 'tenant',
    permission: { action: 'product.read', resourceType: 'product' },
    query: productListQuery,
  },
  async ({ actor, query }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await searchProducts(actor.companyId, query) };
  },
);

export const POST = withApi(
  {
    id: 'products.create',
    scope: 'tenant',
    permission: { action: 'product.create', resourceType: 'product' },
    body: productCreateSchema,
    auditExempt: 'The product service writes the audit entry.',
  },
  async ({ actor, body }) => {
    if (!actor) throw new ForbiddenError();
    return { status: 201, data: await createProduct(actor, body.product, body.confirmDuplicate) };
  },
);
