// path: app/api/integrations/webhooks/deliveries/[deliveryId]/replay/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { replayInput } from '@/lib/integrations/webhook-rules';
import { replayDelivery } from '@/services/webhookout/deliveries';

/** Sends the same event again as a new delivery. */
export const POST = withApi(
  {
    id: 'integrations.webhooks.replay',
    scope: 'tenant',
    permission: { action: 'integrations.webhook.manage', resourceType: 'webhook_endpoint' },
    params: z.object({ deliveryId: z.string().uuid() }).strict(),
    body: replayInput,
    idempotent: true,
    auditExempt: 'The delivery service writes the audit entry.',
  },
  async ({ actor, params }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { status: 201, data: await replayDelivery(actor, params.deliveryId) };
  },
);
