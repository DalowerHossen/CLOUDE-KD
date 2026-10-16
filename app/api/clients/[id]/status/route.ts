// path: app/api/clients/[id]/status/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { statusActionSchema } from '@/lib/crm/clients';
import { setClientStatus } from '@/services/client/clients';

export const POST = withApi(
  {
    id: 'clients.status',
    scope: 'tenant',
    permission: { action: 'client.archive', resourceType: 'client' },
    params: z.object({ id: z.string().uuid() }).strict(),
    body: statusActionSchema,
    auditExempt: 'The client service writes the audit entry.',
  },
  async ({ actor, params: p, body }) => {
    if (!actor) throw new ForbiddenError();
    return { data: await setClientStatus(actor, p.id, body.action) };
  },
);
