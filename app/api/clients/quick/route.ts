// path: app/api/clients/quick/route.ts
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { quickClientSchema } from '@/lib/crm/clients';
import { quickCreateClient } from '@/services/client/clients';

export const POST = withApi(
  {
    id: 'clients.quick',
    scope: 'tenant',
    permission: { action: 'client.create', resourceType: 'client' },
    body: quickClientSchema,
    auditExempt: 'The client service writes the audit entry.',
  },
  async ({ actor, body }) => {
    if (!actor) throw new ForbiddenError();
    return { status: 201, data: await quickCreateClient(actor, body) };
  },
);
