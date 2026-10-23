// path: app/api/payouts/[id]/reverse/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { plain } from '@/lib/crm/clients';
import { ForbiddenError } from '@/lib/errors';
import { reversePayout } from '@/services/payout/payouts';

export const POST = withApi(
  {
    id: 'payouts.reverse',
    scope: 'platform',
    networkContext: 'admin',
    permission: { action: 'payout.settings.manage', resourceType: 'payout' },
    params: z.object({ id: z.string().uuid() }).strict(),
    body: z.strictObject({ reason: plain(3, 300) }),
    auditExempt: 'The payout service writes the audit entry.',
  },
  async ({ actor, params, body }) => {
    if (!actor) throw new ForbiddenError();
    return { data: await reversePayout(actor, params.id, body.reason) };
  },
);
