// path: app/api/integrations/settlement/payouts/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { SETTLEMENT_STEP_UP_SECONDS } from '@/config/s16-settlement';
import { ForbiddenError } from '@/lib/errors';
import { payoutInput } from '@/lib/gateway/split-rules';
import { listPayouts, recordPayout } from '@/services/gateway/transfers';

const query = z.object({ subMerchantId: z.string().uuid() }).strict();

export const GET = withApi(
  {
    id: 'settlement.payouts.list',
    scope: 'tenant',
    permission: { action: 'settlement.read', resourceType: 'settlement_payout' },
    query,
  },
  async ({ actor, query: q }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await listPayouts(actor.companyId, q.subMerchantId) };
  },
);

/** Records a payout that the main merchant made to a sub-merchant. The platform sends no money. */
export const POST = withApi(
  {
    id: 'settlement.payouts.record',
    scope: 'tenant',
    permission: { action: 'settlement.manage', resourceType: 'settlement_payout' },
    body: payoutInput,
    stepUp: { maxAgeSeconds: SETTLEMENT_STEP_UP_SECONDS },
    auditExempt: 'The payout service writes the audit entry.',
  },
  async ({ actor, body }) => {
    if (!actor) throw new ForbiddenError();
    return { status: 201, data: await recordPayout(actor, body) };
  },
);
