// path: app/api/payouts/[id]/paid/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { markPaid } from '@/services/payout/payouts';

export const POST = withApi(
  {
    id: 'payouts.paid',
    scope: 'platform',
    networkContext: 'admin',
    permission: { action: 'payout.queue.manage', resourceType: 'payout' },
    params: z.object({ id: z.string().uuid() }).strict(),
    body: z.strictObject({ reference: z.string().trim().min(3).max(120) }),
    auditExempt: 'The payout service writes the audit entry.',
  },
  async ({ actor, params, body }) => {
    if (!actor) throw new ForbiddenError();
    return { data: await markPaid(actor, params.id, body.reference) };
  },
);
