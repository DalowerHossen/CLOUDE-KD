// path: app/api/integrations/gateway/kyc/route.ts
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { kycQueue } from '@/services/gateway/kyc-review';

export const GET = withApi(
  {
    id: 'gateway.kyc.queue',
    scope: 'tenant',
    permission: { action: 'gateway.kyc.review', resourceType: 'sub_merchant_kyc' },
  },
  async ({ actor }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await kycQueue(actor.companyId) };
  },
);
