// path: app/api/integrations/commerce/connections/[id]/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { COMMERCE_STEP_UP_SECONDS } from '@/config/s16-commerce';
import { ForbiddenError } from '@/lib/errors';
import { connectionUpdate } from '@/lib/integrations/mapping-rules';
import {
  getConnection,
  removeConnection,
  updateConnection,
} from '@/services/integration/connections';

const params = z.object({ id: z.string().uuid() }).strict();

export const GET = withApi(
  {
    id: 'commerce.connections.get',
    scope: 'tenant',
    permission: { action: 'commerce.read', resourceType: 'integration' },
    params,
  },
  async ({ actor, params: p }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await getConnection(actor.companyId, p.id) };
  },
);

export const PATCH = withApi(
  {
    id: 'commerce.connections.update',
    scope: 'tenant',
    permission: { action: 'commerce.manage', resourceType: 'integration' },
    params,
    body: connectionUpdate,
    stepUp: { maxAgeSeconds: COMMERCE_STEP_UP_SECONDS },
    auditExempt: 'The connection service writes the audit entry.',
  },
  async ({ actor, params: p, body }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await updateConnection(actor, p.id, body) };
  },
);

/** Disconnects the store. Its orders and log stay. */
export const DELETE = withApi(
  {
    id: 'commerce.connections.remove',
    scope: 'tenant',
    permission: { action: 'commerce.manage', resourceType: 'integration' },
    params,
    stepUp: { maxAgeSeconds: COMMERCE_STEP_UP_SECONDS },
    auditExempt: 'The connection service writes the audit entry.',
  },
  async ({ actor, params: p }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    await removeConnection(actor, p.id);
    return { data: { ok: true } };
  },
);
