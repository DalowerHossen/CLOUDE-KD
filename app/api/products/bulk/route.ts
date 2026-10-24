// path: app/api/products/bulk/route.ts
import { withApi } from '@/lib/api/with-api';
import { getService } from '@/lib/container';
import { ForbiddenError } from '@/lib/errors';
import { productBulkSchema } from '@/lib/transfer/bulk';
import { bulkProducts } from '@/services/product/bulk';

export const POST = withApi(
  {
    id: 'products.bulk',
    scope: 'tenant',
    permission: { action: 'product.bulk', resourceType: 'product' },
    rateLimitPolicy: 'strict',
    body: productBulkSchema,
    auditExempt: 'The bulk service writes the audit entry.',
  },
  async ({ actor, body }) => {
    if (!actor) throw new ForbiddenError();
    const needed = body.action === 'delete' ? 'product.delete' : 'product.archive';
    if (!(await getService('permissions').can(actor, needed, { type: 'product' })))
      throw new ForbiddenError();
    return { data: await bulkProducts(actor, body) };
  },
);
