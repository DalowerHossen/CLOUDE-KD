// path: app/api/disputes/refund-requests/route.ts
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { listRefundRequests } from '@/services/dispute/refund-requests';

export const GET = withApi(
  {
    id: 'disputes.refundRequests.list',
    scope: 'tenant',
    permission: { action: 'dispute.refund.decide', resourceType: 'dispute' },
  },
  async ({ actor }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await listRefundRequests(actor.companyId) };
  },
);
