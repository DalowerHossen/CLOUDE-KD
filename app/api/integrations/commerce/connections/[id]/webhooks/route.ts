// path: app/api/integrations/commerce/connections/[id]/webhooks/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { COMMERCE_STEP_UP_SECONDS } from '@/config/s16-commerce';
import { ForbiddenError } from '@/lib/errors';
import { registerWebhooks } from '@/services/integration/connections';

/** Registers the order (and refund) webhooks of the platform at the store. */
export const POST = withApi(
  {
    id: 'commerce.connections.webhooks',
    scope: 'tenant',
    permission: { action: 'commerce.manage', resourceType: 'integration' },
    params: z.object({ id: z.string().uuid() }).strict(),
    body: z.object({}).strict(),
    stepUp: { maxAgeSeconds: COMMERCE_STEP_UP_SECONDS },
    auditExempt: 'The connection service writes the audit entry.',
  },
  async ({ actor, params }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await registerWebhooks(actor, params.id) };
  },
);
