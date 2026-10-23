// path: app/api/purchase-orders/route.ts
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { poInputSchema, poListQuery } from '@/lib/procurement/orders';
import { createOrder, listOrders } from '@/services/purchase/orders';

export const GET = withApi(
  {
    id: 'po.list',
    scope: 'tenant',
    permission: { action: 'po.read', resourceType: 'purchase_order' },
    query: poListQuery,
  },
  async ({ actor, query }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await listOrders(actor.companyId, query) };
  },
);

export const POST = withApi(
  {
    id: 'po.create',
    scope: 'tenant',
    permission: { action: 'po.write', resourceType: 'purchase_order' },
    body: poInputSchema,
    auditExempt: 'The order service writes the audit entry.',
  },
  async ({ actor, body }) => {
    if (!actor) throw new ForbiddenError();
    return { status: 201, data: await createOrder(actor, body) };
  },
);
