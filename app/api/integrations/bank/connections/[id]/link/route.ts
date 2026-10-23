// path: app/api/integrations/bank/connections/[id]/link/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { BANKFEED_STEP_UP_SECONDS } from '@/config/s16-bankfeed';
import { ForbiddenError } from '@/lib/errors';
import { linkInput } from '@/lib/integrations/bank-rules';
import { startLink } from '@/services/bankfeed/connections';

/** Starts the bank's own window to link the bank, or to log in again. Answers its address; the user opens it. */
export const POST = withApi(
  {
    id: 'bankfeed.connections.link',
    scope: 'tenant',
    permission: { action: 'bankfeed.manage', resourceType: 'bank_feed_connection' },
    params: z.object({ id: z.string().uuid() }).strict(),
    body: linkInput,
    stepUp: { maxAgeSeconds: BANKFEED_STEP_UP_SECONDS },
    auditExempt: 'The connection service writes the audit entry.',
  },
  async ({ actor, params, body }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await startLink(actor, params.id, body) };
  },
);
