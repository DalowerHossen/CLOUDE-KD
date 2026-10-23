// path: app/api/clients/custom-fields/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { customFieldsSaveSchema } from '@/lib/crm/clients';
import { listDefs, saveDefs } from '@/services/client/custom-fields';

export const GET = withApi(
  {
    id: 'customfields.list',
    scope: 'tenant',
    permission: { action: 'client.read', resourceType: 'client' },
    query: z.object({ entity: z.enum(['client', 'product', 'supplier']) }).strict(),
  },
  async ({ actor, query }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await listDefs(actor.companyId, query.entity) };
  },
);

export const PUT = withApi(
  {
    id: 'customfields.save',
    scope: 'tenant',
    permission: { action: 'catalog.fields', resourceType: 'custom_field_defs' },
    body: customFieldsSaveSchema,
    auditExempt: 'The custom field service writes the audit entry.',
  },
  async ({ actor, body }) => {
    if (!actor) throw new ForbiddenError();
    return { data: await saveDefs(actor, body.entity, body.fields) };
  },
);
