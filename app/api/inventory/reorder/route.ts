// path: app/api/inventory/reorder/route.ts
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { reorderSchema } from '@/lib/stock/stock';
import { setReorderLevel } from '@/services/inventory/stock';

export const PUT = withApi(
  {
    id: 'stock.reorder',
    scope: 'tenant',
    permission: { action: 'inventory.adjust', resourceType: 'stock' },
    body: reorderSchema,
    auditExempt: 'The stock service writes the audit entry.',
  },
  async ({ actor, body }) => {
    if (!actor) throw new ForbiddenError();
    await setReorderLevel(actor, body.productId, body.reorderLevel);
    return { data: { done: true } };
  },
);
