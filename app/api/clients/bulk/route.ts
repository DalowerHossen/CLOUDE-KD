// path: app/api/clients/bulk/route.ts
import { withApi } from '@/lib/api/with-api';
import { getService } from '@/lib/container';
import { ForbiddenError } from '@/lib/errors';
import { bulkSchema } from '@/lib/crm/privacy';
import { bulkClients } from '@/services/client/bulk';

export const POST = withApi(
  {
    id: 'clients.bulk',
    scope: 'tenant',
    permission: { action: 'client.bulk', resourceType: 'client' },
    rateLimitPolicy: 'strict',
    body: bulkSchema,
    auditExempt: 'The bulk service writes the audit entry.',
  },
  async ({ actor, body }) => {
    if (!actor) throw new ForbiddenError();
    // Each kind of change also needs its own permission.
    const needed =
      body.action === 'delete'
        ? 'client.delete'
        : body.action === 'archive' || body.action === 'reactivate'
          ? 'client.archive'
          : 'client.update';
    if (!(await getService('permissions').can(actor, needed, { type: 'client' })))
      throw new ForbiddenError();
    return { data: await bulkClients(actor, body) };
  },
);
