// path: app/api/inventory/transfer/route.ts
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { transferSchema } from '@/lib/stock/stock';
import { transferStock } from '@/services/inventory/stock';

export const POST = withApi(
  {
    id: 'stock.transfer',
    scope: 'tenant',
    permission: { action: 'inventory.transfer', resourceType: 'stock' },
    body: transferSchema,
    auditExempt: 'The stock service writes the audit entry.',
  },
  async ({ actor, body }) => {
    if (!actor) throw new ForbiddenError();
    return { data: await transferStock(actor, body) };
  },
);
