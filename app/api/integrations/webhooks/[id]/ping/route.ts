// path: app/api/integrations/webhooks/[id]/ping/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { sendTest } from '@/services/webhookout/dispatch';

/** Sends a signed test event to the endpoint once and returns how it went. Works for a paused or switched-off endpoint too. */
export const POST = withApi(
  {
    id: 'integrations.webhooks.ping',
    scope: 'tenant',
    permission: { action: 'integrations.webhook.manage', resourceType: 'webhook_endpoint' },
    params: z.object({ id: z.string().uuid() }).strict(),
    rateLimitPolicy: 'strict',
    auditExempt: 'The dispatch service writes the audit entry.',
  },
  async ({ actor, params }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await sendTest(actor, params.id) };
  },
);
