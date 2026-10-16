// path: app/api/products/[id]/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { productUpdateSchema } from '@/lib/catalog/products';
import { deleteProduct, getProduct, updateProduct } from '@/services/product/products';

const params = z.object({ id: z.string().uuid() }).strict();

export const GET = withApi(
  {
    id: 'products.get',
    scope: 'tenant',
    permission: { action: 'product.read', resourceType: 'product' },
    params,
  },
  async ({ actor, params: p }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await getProduct(actor.companyId, p.id) };
  },
);

export const PUT = withApi(
  {
    id: 'products.update',
    scope: 'tenant',
    permission: { action: 'product.update', resourceType: 'product' },
    params,
    body: productUpdateSchema,
    auditExempt: 'The product service writes the audit entry.',
  },
  async ({ actor, params: p, body }) => {
    if (!actor) throw new ForbiddenError();
    return { data: await updateProduct(actor, p.id, body.expectedVersion, body.product) };
  },
);

export const DELETE = withApi(
  {
    id: 'products.delete',
    scope: 'tenant',
    permission: { action: 'product.delete', resourceType: 'product' },
    params,
    auditExempt: 'The product service writes the audit entry.',
  },
  async ({ actor, params: p }) => {
    if (!actor) throw new ForbiddenError();
    await deleteProduct(actor, p.id);
    return { data: { done: true } };
  },
);
