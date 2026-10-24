// path: app/api/integrations/bank/connections/[id]/finish/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { finishLink } from '@/services/bankfeed/connections';

/** Plaid: reads the result of the last link window (for when the webhook did not arrive). */
export const POST = withApi(
  {
    id: 'bankfeed.connections.finish',
    scope: 'tenant',
    permission: { action: 'bankfeed.manage', resourceType: 'bank_feed_connection' },
    params: z.object({ id: z.string().uuid() }).strict(),
    body: z.object({}).strict(),
    auditExempt: 'The connection service writes the audit entry.',
  },
  async ({ actor, params }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await finishLink(actor, params.id) };
  },
);
