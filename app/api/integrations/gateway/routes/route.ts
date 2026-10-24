// path: app/api/integrations/gateway/routes/route.ts
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { routeInput } from '@/lib/gateway/rules';
import { createRoute, listRoutes } from '@/services/gateway/routes';

export const GET = withApi(
  {
    id: 'gateway.routes.list',
    scope: 'tenant',
    permission: { action: 'gateway.read', resourceType: 'gateway_route' },
  },
  async ({ actor }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await listRoutes(actor.companyId) };
  },
);

export const POST = withApi(
  {
    id: 'gateway.routes.create',
    scope: 'tenant',
    permission: { action: 'gateway.manage', resourceType: 'gateway_route' },
    body: routeInput,
    auditExempt: 'The route service writes the audit entry.',
  },
  async ({ actor, body }) => {
    if (!actor) throw new ForbiddenError();
    return { status: 201, data: await createRoute(actor, body) };
  },
);
