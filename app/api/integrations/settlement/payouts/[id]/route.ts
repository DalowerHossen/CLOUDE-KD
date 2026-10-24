// path: app/api/integrations/settlement/payouts/[id]/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { SETTLEMENT_STEP_UP_SECONDS } from '@/config/s16-settlement';
import { ForbiddenError } from '@/lib/errors';
import { voidInput } from '@/lib/gateway/split-rules';
import { voidPayout } from '@/services/gateway/transfers';

const params = z.object({ id: z.string().uuid() }).strict();

/** Voids a recorded payout with a reason (the amount returns to the balance). A payout is never deleted. */
export const PATCH = withApi(
  {
    id: 'settlement.payouts.void',
    scope: 'tenant',
    permission: { action: 'settlement.manage', resourceType: 'settlement_payout' },
    params,
    body: voidInput,
    stepUp: { maxAgeSeconds: SETTLEMENT_STEP_UP_SECONDS },
    auditExempt: 'The payout service writes the audit entry.',
  },
  async ({ actor, params: p, body }) => {
    if (!actor) throw new ForbiddenError();
    return { data: await voidPayout(actor, p.id, body) };
  },
);
