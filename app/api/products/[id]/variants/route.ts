// path: app/api/products/[id]/variants/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { variantsSaveSchema } from '@/lib/catalog/products';
import { listVariants, saveVariants } from '@/services/product/variants';

const params = z.object({ id: z.string().uuid() }).strict();

export const GET = withApi(
  {
    id: 'products.variants',
    scope: 'tenant',
    permission: { action: 'product.read', resourceType: 'product' },
    params,
  },
  async ({ actor, params: p }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await listVariants(actor.companyId, p.id) };
  },
);

export const PUT = withApi(
  {
    id: 'products.variants_save',
    scope: 'tenant',
    permission: { action: 'product.update', resourceType: 'product' },
    params,
    body: variantsSaveSchema,
    auditExempt: 'The variant service writes the audit entry.',
  },
  async ({ actor, params: p, body }) => {
    if (!actor) throw new ForbiddenError();
    return { data: await saveVariants(actor, p.id, body.variants) };
  },
);
