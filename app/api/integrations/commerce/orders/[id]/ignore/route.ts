// path: app/api/integrations/commerce/orders/[id]/ignore/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { ignoreOrder } from '@/services/integration/commerce-orders';

/** Decides that an order is not to be handled. */
export const POST = withApi(
  {
    id: 'commerce.orders.ignore',
    scope: 'tenant',
    permission: { action: 'commerce.sync', resourceType: 'integration_order' },
    params: z.object({ id: z.string().uuid() }).strict(),
    body: z.object({}).strict(),
    idempotent: true,
    auditExempt: 'The order service writes the audit entry.',
  },
  async ({ actor, params }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await ignoreOrder(actor, params.id) };
  },
);
