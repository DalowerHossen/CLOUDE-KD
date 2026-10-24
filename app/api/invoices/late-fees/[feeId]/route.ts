// path: app/api/invoices/late-fees/[feeId]/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { feeDecisionSchema } from '@/lib/schedule/input';
import { applyLateFee, waiveLateFee } from '@/services/invoice/late-fees';

export const POST = withApi(
  {
    id: 'lateFees.decide',
    scope: 'tenant',
    permission: { action: 'latefee.manage', resourceType: 'late_fee' },
    params: z.object({ feeId: z.string().uuid() }).strict(),
    body: feeDecisionSchema,
    idempotent: true,
    rateLimitPolicy: 'strict',
    auditExempt: 'The late fee service writes the audit entry.',
  },
  async ({ actor, params: p, body }) => {
    if (!actor) throw new ForbiddenError();
    return {
      data:
        body.action === 'apply'
          ? await applyLateFee(actor, p.feeId)
          : await waiveLateFee(actor, p.feeId, body.reason.trim()),
    };
  },
);
