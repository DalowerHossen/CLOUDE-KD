// path: app/api/integrations/messaging/routes/route.ts
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { routeInput } from '@/lib/messaging/rules';
import { listRoutes, saveRoute } from '@/services/messaging/preferences';

export const GET = withApi(
  {
    id: 'messaging.routes.list',
    scope: 'tenant',
    permission: { action: 'integrations.messaging.read', resourceType: 'messaging_route' },
  },
  async ({ actor }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await listRoutes(actor.companyId) };
  },
);

/** Sets the channels (in order) for one kind of message. */
export const PUT = withApi(
  {
    id: 'messaging.routes.save',
    scope: 'tenant',
    permission: { action: 'integrations.messaging.manage', resourceType: 'messaging_route' },
    body: routeInput,
    auditExempt: 'The messaging service writes the audit entry.',
  },
  async ({ actor, body }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await saveRoute(actor, body) };
  },
);
