// path: app/api/integrations/messaging/routes/[id]/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { deleteRoute } from '@/services/messaging/preferences';

export const DELETE = withApi(
  {
    id: 'messaging.routes.remove',
    scope: 'tenant',
    permission: { action: 'integrations.messaging.manage', resourceType: 'messaging_route' },
    params: z.object({ id: z.string().uuid() }).strict(),
    auditExempt: 'The messaging service writes the audit entry.',
  },
  async ({ actor, params }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    await deleteRoute(actor, params.id);
    return { data: { ok: true } };
  },
);
