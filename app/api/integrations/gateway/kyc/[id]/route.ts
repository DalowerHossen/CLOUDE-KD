// path: app/api/integrations/gateway/kyc/[id]/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { kycCase } from '@/services/gateway/kyc-review';

const params = z.object({ id: z.string().uuid() }).strict();

export const GET = withApi(
  {
    id: 'gateway.kyc.case',
    scope: 'tenant',
    permission: { action: 'gateway.kyc.review', resourceType: 'sub_merchant_kyc' },
    params,
  },
  async ({ actor, params: p }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await kycCase(actor.companyId, p.id) };
  },
);
