// path: app/api/payouts/[id]/decide/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { plain } from '@/lib/crm/clients';
import { ForbiddenError } from '@/lib/errors';
import { decidePayout } from '@/services/payout/payouts';

/** An approver (owner for staff requests, CEO for large payouts) decides a payout that waits for approval. */
export const POST = withApi(
  {
    id: 'payouts.decide',
    scope: 'tenant',
    permission: { action: 'wallet.read', resourceType: 'payout' },
    params: z.object({ id: z.string().uuid() }).strict(),
    body: z.strictObject({
      decision: z.enum(['approve', 'reject']),
      reason: plain(0, 300).optional(),
    }),
    auditExempt: 'The approval service and the payout service write the audit entries.',
  },
  async ({ actor, params, body }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await decidePayout(actor, params.id, body.decision, body.reason ?? null) };
  },
);
