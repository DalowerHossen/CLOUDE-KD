// path: app/api/inventory/receive/route.ts
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { receiveSchema } from '@/lib/stock/stock';
import { receiveStock } from '@/services/inventory/stock';

export const POST = withApi(
  {
    id: 'stock.receive',
    scope: 'tenant',
    permission: { action: 'inventory.adjust', resourceType: 'stock' },
    body: receiveSchema,
    auditExempt: 'The stock service writes the audit entry.',
  },
  async ({ actor, body }) => {
    if (!actor) throw new ForbiddenError();
    return { status: 201, data: await receiveStock(actor, body) };
  },
);
