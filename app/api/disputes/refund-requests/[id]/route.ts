// path: app/api/disputes/refund-requests/[id]/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { decideRefundRequest } from '@/services/dispute/refund-requests';
import { decideRequestBody } from '@/services/portal/schemas';

const params = z.object({ id: z.string().uuid() }).strict();

/** Approve (the refund is made through the payments service) or deny (with a reason). A request is decided once. */
export const POST = withApi(
  {
    id: 'disputes.refundRequests.decide',
    scope: 'tenant',
    permission: { action: 'dispute.refund.decide', resourceType: 'dispute' },
    rateLimitPolicy: 'strict',
    params,
    body: decideRequestBody,
    auditExempt:
      'The refund request table has the audit trigger and the payments service records the refund.',
  },
  async ({ actor, params: p, body }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await decideRefundRequest(actor, p.id, body.decision, body.reason) };
  },
);
