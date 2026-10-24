// path: app/api/inventory/adjust/route.ts
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { adjustSchema } from '@/lib/stock/stock';
import { adjustStock } from '@/services/inventory/stock';

export const POST = withApi(
  {
    id: 'stock.adjust',
    scope: 'tenant',
    permission: { action: 'inventory.adjust', resourceType: 'stock' },
    body: adjustSchema,
    auditExempt: 'The stock service writes the audit entry.',
  },
  async ({ actor, body }) => {
    if (!actor) throw new ForbiddenError();
    return { data: await adjustStock(actor, body) };
  },
);
