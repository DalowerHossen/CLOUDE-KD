// path: app/api/integrations/webhooks/[id]/rotate-secret/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { API_KEY_STEP_UP_SECONDS } from '@/config/s16-api';
import { ForbiddenError } from '@/lib/errors';
import { rotateSecret } from '@/services/webhookout/endpoints';

/** A new signing secret (in this answer only). The old one stays valid for 24 hours. */
export const POST = withApi(
  {
    id: 'integrations.webhooks.rotate_secret',
    scope: 'tenant',
    permission: { action: 'integrations.webhook.manage', resourceType: 'webhook_endpoint' },
    params: z.object({ id: z.string().uuid() }).strict(),
    stepUp: { maxAgeSeconds: API_KEY_STEP_UP_SECONDS },
    auditExempt: 'The webhook service writes the audit entry.',
  },
  async ({ actor, params }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { status: 201, data: await rotateSecret(actor, params.id) };
  },
);
