// path: app/api/integrations/webhooks/route.ts
import { withApi } from '@/lib/api/with-api';
import { API_KEY_STEP_UP_SECONDS } from '@/config/s16-api';
import { ForbiddenError } from '@/lib/errors';
import { endpointInput } from '@/lib/integrations/webhook-rules';
import { createEndpoint, listEndpoints } from '@/services/webhookout/endpoints';

export const GET = withApi(
  {
    id: 'integrations.webhooks.list',
    scope: 'tenant',
    permission: { action: 'integrations.webhook.read', resourceType: 'webhook_endpoint' },
  },
  async ({ actor }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await listEndpoints(actor.companyId) };
  },
);

/** Adds an endpoint. The signing secret is in this one answer only, so the route is not idempotent (a replay would store it). */
export const POST = withApi(
  {
    id: 'integrations.webhooks.create',
    scope: 'tenant',
    permission: { action: 'integrations.webhook.manage', resourceType: 'webhook_endpoint' },
    body: endpointInput,
    stepUp: { maxAgeSeconds: API_KEY_STEP_UP_SECONDS },
    auditExempt: 'The webhook service writes the audit entry.',
  },
  async ({ actor, body }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { status: 201, data: await createEndpoint(actor, body) };
  },
);
