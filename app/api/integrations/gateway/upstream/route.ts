// path: app/api/integrations/gateway/upstream/route.ts
import { withApi } from '@/lib/api/with-api';
import { GATEWAY_STEP_UP_SECONDS } from '@/config/s16-gateway';
import { ForbiddenError } from '@/lib/errors';
import { upstreamInput, upstreamUpdate } from '@/lib/gateway/rules';
import { createUpstream, getUpstream, updateUpstream } from '@/services/gateway/upstream';

export const GET = withApi(
  {
    id: 'gateway.upstream.get',
    scope: 'tenant',
    permission: { action: 'gateway.read', resourceType: 'gateway_upstream' },
  },
  async ({ actor }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await getUpstream(actor.companyId) };
  },
);

/** Saves the address of the company's app. The signing secret is in the answer once. */
export const POST = withApi(
  {
    id: 'gateway.upstream.create',
    scope: 'tenant',
    permission: { action: 'gateway.manage', resourceType: 'gateway_upstream' },
    body: upstreamInput,
    stepUp: { maxAgeSeconds: GATEWAY_STEP_UP_SECONDS },
    auditExempt: 'The upstream service writes the audit entry.',
  },
  async ({ actor, body }) => {
    if (!actor) throw new ForbiddenError();
    return { status: 201, data: await createUpstream(actor, body) };
  },
);

export const PATCH = withApi(
  {
    id: 'gateway.upstream.update',
    scope: 'tenant',
    permission: { action: 'gateway.manage', resourceType: 'gateway_upstream' },
    body: upstreamUpdate,
    stepUp: { maxAgeSeconds: GATEWAY_STEP_UP_SECONDS },
    auditExempt: 'The upstream service writes the audit entry.',
  },
  async ({ actor, body }) => {
    if (!actor) throw new ForbiddenError();
    return { data: await updateUpstream(actor, body) };
  },
);
