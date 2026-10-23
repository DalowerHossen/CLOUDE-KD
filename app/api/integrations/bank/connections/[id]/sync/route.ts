// path: app/api/integrations/bank/connections/[id]/sync/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { syncConnection } from '@/services/bankfeed/sync';

/** Fetches the newest bank lines now. A repeat changes nothing: lines that were imported are skipped. */
export const POST = withApi(
  {
    id: 'bankfeed.connections.sync',
    scope: 'tenant',
    permission: { action: 'bankfeed.sync', resourceType: 'bank_feed_connection' },
    params: z.object({ id: z.string().uuid() }).strict(),
    body: z.object({}).strict(),
    idempotent: true,
    auditExempt: 'The sync service writes the audit entry when lines were imported.',
  },
  async ({ actor, params }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await syncConnection(actor.companyId, params.id) };
  },
);
