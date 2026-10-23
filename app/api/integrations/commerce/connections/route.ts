// path: app/api/integrations/commerce/connections/route.ts
import { withApi } from '@/lib/api/with-api';
import { COMMERCE_STEP_UP_SECONDS } from '@/config/s16-commerce';
import { ForbiddenError } from '@/lib/errors';
import { connectInput } from '@/lib/integrations/mapping-rules';
import { connectStore, listConnections } from '@/services/integration/connections';

export const GET = withApi(
  {
    id: 'commerce.connections.list',
    scope: 'tenant',
    permission: { action: 'commerce.read', resourceType: 'integration' },
  },
  async ({ actor }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await listConnections(actor.companyId) };
  },
);

/** Connects a store. The credentials are sealed at once and never returned. */
export const POST = withApi(
  {
    id: 'commerce.connections.connect',
    scope: 'tenant',
    permission: { action: 'commerce.manage', resourceType: 'integration' },
    body: connectInput,
    stepUp: { maxAgeSeconds: COMMERCE_STEP_UP_SECONDS },
    auditExempt: 'The connection service writes the audit entry.',
  },
  async ({ actor, body }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { status: 201, data: await connectStore(actor, body) };
  },
);
