// path: app/api/clients/route.ts
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { clientCreateSchema } from '@/lib/crm/clients';
import { createClient } from '@/services/client/clients';
import { clientListQuery } from '@/lib/crm/search';
import { searchClients } from '@/services/client/search';

export const GET = withApi(
  {
    id: 'clients.list',
    scope: 'tenant',
    permission: { action: 'client.read', resourceType: 'client' },
    query: clientListQuery,
  },
  async ({ actor, query }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await searchClients(actor.companyId, query) };
  },
);

export const POST = withApi(
  {
    id: 'clients.create',
    scope: 'tenant',
    permission: { action: 'client.create', resourceType: 'client' },
    body: clientCreateSchema,
    auditExempt: 'The client service writes the audit entry.',
  },
  async ({ actor, body }) => {
    if (!actor) throw new ForbiddenError();
    return { status: 201, data: await createClient(actor, body, body.confirmDuplicate) };
  },
);
