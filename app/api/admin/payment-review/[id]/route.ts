// path: app/api/admin/payment-review/[id]/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { reviewDecisionSchema } from '@/schemas/payment/review';
import { decideReview } from '@/services/payment/reviews';

const params = z.object({ id: z.string().uuid() }).strict();

export const POST = withApi(
  {
    id: 'admin.paymentReview.decide',
    scope: 'platform',
    networkContext: 'admin',
    stepUp: { maxAgeSeconds: 300 },
    rateLimitPolicy: 'strict',
    params,
    body: reviewDecisionSchema,
    auditExempt: 'The review service writes the audit entry of every decision.',
  },
  async ({ actor, params: p, body }) => {
    if (!actor) throw new ForbiddenError();
    return { data: await decideReview(actor, p.id, body) };
  },
);
