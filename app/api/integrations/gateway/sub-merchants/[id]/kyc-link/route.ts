// path: app/api/integrations/gateway/sub-merchants/[id]/kyc-link/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { GATEWAY_STEP_UP_SECONDS } from '@/config/s16-gateway';
import { ForbiddenError } from '@/lib/errors';
import { kycLinkInput } from '@/lib/gateway/kyc-rules';
import { createKycLink } from '@/services/gateway/kyc-links';

const params = z.object({ id: z.string().uuid() }).strict();

/** Makes the secure link for the sub-merchant's verification. The link is in the answer once; earlier links stop working. */
export const POST = withApi(
  {
    id: 'gateway.kycLink.create',
    scope: 'tenant',
    permission: { action: 'gateway.kyc.review', resourceType: 'sub_merchant_kyc' },
    params,
    body: kycLinkInput,
    stepUp: { maxAgeSeconds: GATEWAY_STEP_UP_SECONDS },
    auditExempt: 'The link service writes the audit entry.',
  },
  async ({ actor, params: p, body }) => {
    if (!actor) throw new ForbiddenError();
    return { status: 201, data: await createKycLink(actor, p.id, body) };
  },
);
