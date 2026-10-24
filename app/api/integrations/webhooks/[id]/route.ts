// path: app/api/integrations/webhooks/[id]/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { endpointUpdate } from '@/lib/integrations/webhook-rules';
import { deleteEndpoint, getEndpoint, updateEndpoint } from '@/services/webhookout/endpoints';

const params = z.object({ id: z.string().uuid() }).strict();

export const GET = withApi(
  {
    id: 'integrations.webhooks.get',
    scope: 'tenant',
    permission: { action: 'integrations.webhook.read', resourceType: 'webhook_endpoint' },
    params,
  },
  async ({ actor, params: p }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await getEndpoint(actor.companyId, p.id) };
  },
);

export const PATCH = withApi(
  {
    id: 'integrations.webhooks.update',
    scope: 'tenant',
    permission: { action: 'integrations.webhook.manage', resourceType: 'webhook_endpoint' },
    params,
    body: endpointUpdate,
    auditExempt: 'The webhook service writes the audit entry.',
  },
  async ({ actor, params: p, body }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await updateEndpoint(actor, p.id, body) };
  },
);

export const DELETE = withApi(
  {
    id: 'integrations.webhooks.remove',
    scope: 'tenant',
    permission: { action: 'integrations.webhook.manage', resourceType: 'webhook_endpoint' },
    params,
    auditExempt: 'The webhook service writes the audit entry.',
  },
  async ({ actor, params: p }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    await deleteEndpoint(actor, p.id);
    return { data: { ok: true } };
  },
);
