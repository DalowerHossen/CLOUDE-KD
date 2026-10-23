// path: app/api/clients/[id]/statement/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { statementQuery } from '@/lib/crm/search';
import { statementData } from '@/services/client/statement';

export const GET = withApi(
  {
    id: 'clients.statement',
    scope: 'tenant',
    permission: { action: 'client.read', resourceType: 'client' },
    params: z.object({ id: z.string().uuid() }).strict(),
    query: statementQuery,
  },
  async ({ actor, params: p, query }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await statementData(actor.companyId, p.id, query) };
  },
);
