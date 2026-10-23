// path: app/api/integrations/webhooks/deliveries/[deliveryId]/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { getDelivery } from '@/services/webhookout/deliveries';

export const GET = withApi(
  {
    id: 'integrations.webhooks.delivery',
    scope: 'tenant',
    permission: { action: 'integrations.webhook.read', resourceType: 'webhook_endpoint' },
    params: z.object({ deliveryId: z.string().uuid() }).strict(),
  },
  async ({ actor, params }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await getDelivery(actor.companyId, params.deliveryId) };
  },
);
