// path: app/api/integrations/commerce/orders/[id]/retry/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { retryOrder } from '@/services/integration/commerce-orders';

/** Tries a failed or waiting order again from the start. */
export const POST = withApi(
  {
    id: 'commerce.orders.retry',
    scope: 'tenant',
    permission: { action: 'commerce.sync', resourceType: 'integration_order' },
    params: z.object({ id: z.string().uuid() }).strict(),
    body: z.object({}).strict(),
    idempotent: true,
    auditExempt: 'The order service writes the audit entry.',
  },
  async ({ actor, params }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await retryOrder(actor, params.id) };
  },
);
