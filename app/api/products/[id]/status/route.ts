// path: app/api/products/[id]/status/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { setProductStatus } from '@/services/product/products';

export const POST = withApi(
  {
    id: 'products.status',
    scope: 'tenant',
    permission: { action: 'product.archive', resourceType: 'product' },
    params: z.object({ id: z.string().uuid() }).strict(),
    body: z.object({ status: z.enum(['active', 'inactive', 'archived']) }).strict(),
    auditExempt: 'The product service writes the audit entry.',
  },
  async ({ actor, params: p, body }) => {
    if (!actor) throw new ForbiddenError();
    return { data: await setProductStatus(actor, p.id, body.status) };
  },
);
