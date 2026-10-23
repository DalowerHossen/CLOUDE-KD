// path: app/api/integrations/webhooks/[id]/deliveries/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { listDeliveries } from '@/services/webhookout/deliveries';

export const GET = withApi(
  {
    id: 'integrations.webhooks.deliveries',
    scope: 'tenant',
    permission: { action: 'integrations.webhook.read', resourceType: 'webhook_endpoint' },
    params: z.object({ id: z.string().uuid() }).strict(),
    query: z.object({ limit: z.coerce.number().int().min(1).max(200).default(50) }).strict(),
  },
  async ({ actor, params, query }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await listDeliveries(actor.companyId, params.id, query.limit) };
  },
);
