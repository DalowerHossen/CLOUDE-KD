// path: app/api/clients/[id]/activity/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { activitySchema } from '@/lib/crm/search';
import { addActivity, timeline } from '@/services/client/activity';

const params = z.object({ id: z.string().uuid() }).strict();

export const GET = withApi(
  {
    id: 'clients.activity',
    scope: 'tenant',
    permission: { action: 'client.read', resourceType: 'client' },
    params,
  },
  async ({ actor, params: p }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await timeline(actor.companyId, p.id) };
  },
);

export const POST = withApi(
  {
    id: 'clients.activity_add',
    scope: 'tenant',
    permission: { action: 'client.update', resourceType: 'client' },
    params,
    body: activitySchema,
    auditExempt: 'The activity service writes the audit entry.',
  },
  async ({ actor, params: p, body }) => {
    if (!actor) throw new ForbiddenError();
    await addActivity(actor, p.id, body);
    return { status: 201, data: { done: true } };
  },
);
