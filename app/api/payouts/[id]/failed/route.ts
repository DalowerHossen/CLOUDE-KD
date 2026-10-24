// path: app/api/payouts/[id]/failed/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { plain } from '@/lib/crm/clients';
import { ForbiddenError } from '@/lib/errors';
import { markFailed } from '@/services/payout/payouts';

export const POST = withApi(
  {
    id: 'payouts.failed',
    scope: 'platform',
    networkContext: 'admin',
    permission: { action: 'payout.queue.manage', resourceType: 'payout' },
    params: z.object({ id: z.string().uuid() }).strict(),
    body: z.strictObject({ reason: plain(3, 300), final: z.boolean().default(false) }),
    auditExempt: 'The payout service writes the audit entry.',
  },
  async ({ actor, params, body }) => {
    if (!actor) throw new ForbiddenError();
    return { data: await markFailed(actor, params.id, body.reason, body.final) };
  },
);
