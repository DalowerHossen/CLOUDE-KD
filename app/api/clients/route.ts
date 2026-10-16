// path: app/api/clients/route.ts
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { clientInputSchema } from '@/lib/crm/clients';
import { createClient } from '@/services/client/clients';

export const POST = withApi(
  {
    id: 'clients.create',
    scope: 'tenant',
    permission: { action: 'client.create', resourceType: 'client' },
    body: clientInputSchema,
    auditExempt: 'The client service writes the audit entry.',
  },
  async ({ actor, body }) => {
    if (!actor) throw new ForbiddenError();
    return { status: 201, data: await createClient(actor, body) };
  },
);
