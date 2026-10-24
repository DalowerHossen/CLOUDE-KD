// path: app/api/integrations/gateway/routes/[id]/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { routeUpdate } from '@/lib/gateway/rules';
import { deleteRoute, updateRoute } from '@/services/gateway/routes';

const params = z.object({ id: z.string().uuid() }).strict();

export const PATCH = withApi(
  {
    id: 'gateway.routes.update',
    scope: 'tenant',
    permission: { action: 'gateway.manage', resourceType: 'gateway_route' },
    params,
    body: routeUpdate,
    auditExempt: 'The route service writes the audit entry.',
  },
  async ({ actor, params: p, body }) => {
    if (!actor) throw new ForbiddenError();
    return { data: await updateRoute(actor, p.id, body) };
  },
);

export const DELETE = withApi(
  {
    id: 'gateway.routes.delete',
    scope: 'tenant',
    permission: { action: 'gateway.manage', resourceType: 'gateway_route' },
    params,
    auditExempt: 'The route service writes the audit entry.',
  },
  async ({ actor, params: p }) => {
    if (!actor) throw new ForbiddenError();
    await deleteRoute(actor, p.id);
    return { data: { removed: true } };
  },
);
