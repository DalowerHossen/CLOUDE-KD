// path: app/api/kyc/review/[id]/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { reviewActionSchema } from '@/lib/kyc/review-input';
import { reviewDetail, runReviewAction } from '@/services/kyc/review';

const params = z.object({ id: z.string().uuid() }).strict();
const permission = { action: 'kyc.review', resourceType: 'kyc' } as const;

export const GET = withApi(
  { id: 'kyc.review.detail', scope: 'platform', networkContext: 'admin', permission, params },
  async ({ params: p }) => ({ data: await reviewDetail(p.id) }),
);

export const POST = withApi(
  {
    id: 'kyc.review.action',
    scope: 'platform',
    networkContext: 'admin',
    permission,
    stepUp: { maxAgeSeconds: 300 },
    params,
    body: reviewActionSchema,
    auditExempt: 'The review service writes the audit entry.',
  },
  async ({ actor, params: p, body }) => {
    if (!actor) throw new ForbiddenError();
    return { data: await runReviewAction(actor, p.id, body) };
  },
);
