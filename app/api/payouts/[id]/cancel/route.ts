// path: app/api/payouts/[id]/cancel/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { cancelPayout } from '@/services/payout/payouts';

export const POST = withApi(
  {
    id: 'payouts.cancel',
    scope: 'tenant',
    permission: { action: 'wallet.read', resourceType: 'payout' },
    params: z.object({ id: z.string().uuid() }).strict(),
    body: z.strictObject({}),
    auditExempt: 'The payout service writes the audit entry.',
  },
  async ({ actor, params }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await cancelPayout(actor, params.id) };
  },
);
