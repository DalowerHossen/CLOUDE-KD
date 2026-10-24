// path: app/api/integrations/commerce/orders/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ORDER_STATUSES } from '@/config/s16-commerce';
import { ForbiddenError } from '@/lib/errors';
import { listOrders } from '@/services/integration/commerce-orders';

export const GET = withApi(
  {
    id: 'commerce.orders.list',
    scope: 'tenant',
    permission: { action: 'commerce.read', resourceType: 'integration_order' },
    query: z
      .object({
        integrationId: z.string().uuid().optional(),
        status: z.enum(ORDER_STATUSES).optional(),
        limit: z.coerce.number().int().min(1).max(200).default(50),
      })
      .strict(),
  },
  async ({ actor, query }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return {
      data: await listOrders(actor.companyId, {
        limit: query.limit,
        ...(query.integrationId ? { integrationId: query.integrationId } : {}),
        ...(query.status ? { status: query.status } : {}),
      }),
    };
  },
);
