// path: app/api/refunds/[id]/decision/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { refundDecisionSchema } from '@/schemas/payment/payments';
import { decideRefund } from '@/services/payment/refunds';

const params = z.object({ id: z.string().uuid() }).strict();

export const POST = withApi(
  {
    id: 'refunds.decide',
    scope: 'tenant',
    roles: ['owner'],
    permission: { action: 'payment.refund', resourceType: 'payment' },
    rateLimitPolicy: 'strict',
    params,
    body: refundDecisionSchema,
    auditExempt: 'The refund service writes the audit entry of every refund step.',
  },
  async ({ actor, params: p, body }) => {
    if (!actor) throw new ForbiddenError();
    return { data: await decideRefund(actor, p.id, body.decision, body.reason) };
  },
);
