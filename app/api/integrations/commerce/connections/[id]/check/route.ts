// path: app/api/integrations/commerce/connections/[id]/check/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { checkConnection } from '@/services/integration/connections';

/** Reads the store with the saved credentials and notes its name; refused credentials mark the store "connect again". */
export const POST = withApi(
  {
    id: 'commerce.connections.check',
    scope: 'tenant',
    permission: { action: 'commerce.manage', resourceType: 'integration' },
    params: z.object({ id: z.string().uuid() }).strict(),
    body: z.object({}).strict(),
    auditExempt: 'A check changes nothing the owner decided; the sync log keeps the result.',
  },
  async ({ actor, params }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await checkConnection(actor, params.id) };
  },
);
