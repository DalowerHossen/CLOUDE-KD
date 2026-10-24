// path: app/api/integrations/gateway/kyc/[id]/action/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { kycReviewAction } from '@/lib/gateway/kyc-rules';
import { runKycAction } from '@/services/gateway/kyc-review';

const params = z.object({ id: z.string().uuid() }).strict();

/** One step of the review: start, check documents, note, approve, ask for changes, reject. */
export const POST = withApi(
  {
    id: 'gateway.kyc.action',
    scope: 'tenant',
    permission: { action: 'gateway.kyc.review', resourceType: 'sub_merchant_kyc' },
    params,
    body: kycReviewAction,
    stepUp: { maxAgeSeconds: 900 },
    auditExempt: 'The review service writes the audit entry.',
  },
  async ({ actor, params: p, body }) => {
    if (!actor) throw new ForbiddenError();
    return { data: await runKycAction(actor, p.id, body) };
  },
);
