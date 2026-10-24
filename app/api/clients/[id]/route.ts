// path: app/api/clients/[id]/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { clientUpdateSchema } from '@/lib/crm/clients';
import { deleteClient, getClient, updateClient } from '@/services/client/clients';

const params = z.object({ id: z.string().uuid() }).strict();

export const GET = withApi(
  {
    id: 'clients.get',
    scope: 'tenant',
    permission: { action: 'client.read', resourceType: 'client' },
    params,
  },
  async ({ actor, params: p }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await getClient(actor.companyId, p.id) };
  },
);

export const PUT = withApi(
  {
    id: 'clients.update',
    scope: 'tenant',
    permission: { action: 'client.update', resourceType: 'client' },
    params,
    body: clientUpdateSchema,
    auditExempt: 'The client service writes the audit entry.',
  },
  async ({ actor, params: p, body }) => {
    if (!actor) throw new ForbiddenError();
    return { data: await updateClient(actor, p.id, body) };
  },
);

export const DELETE = withApi(
  {
    id: 'clients.delete',
    scope: 'tenant',
    permission: { action: 'client.delete', resourceType: 'client' },
    params,
    auditExempt: 'The client service writes the audit entry.',
  },
  async ({ actor, params: p }) => {
    if (!actor) throw new ForbiddenError();
    await deleteClient(actor, p.id);
    return { data: { done: true } };
  },
);
