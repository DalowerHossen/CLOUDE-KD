// path: app/api/clients/merge/route.ts
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { mergeSchema } from '@/lib/crm/search';
import { mergeClients } from '@/services/client/merge';

export const POST = withApi(
  {
    id: 'clients.merge',
    scope: 'tenant',
    permission: { action: 'client.merge', resourceType: 'client' },
    stepUp: { maxAgeSeconds: 600 },
    body: mergeSchema,
    auditExempt: 'The merge service writes the audit entry.',
  },
  async ({ actor, body }) => {
    if (!actor) throw new ForbiddenError();
    await mergeClients(actor, body.keepId, body.removeId);
    return { data: { done: true } };
  },
);
