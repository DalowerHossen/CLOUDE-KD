// path: app/api/kyc/review/route.ts
import { withApi } from '@/lib/api/with-api';
import { reviewQueue } from '@/services/kyc/review';

export const GET = withApi(
  {
    id: 'kyc.review.queue',
    scope: 'platform',
    networkContext: 'admin',
    permission: { action: 'kyc.review', resourceType: 'kyc' },
  },
  async () => ({ data: await reviewQueue() }),
);
