// path: app/api/admin/payment-review/route.ts
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { canReadReviews, listReviewQueue } from '@/services/payment/reviews';

export const GET = withApi(
  {
    id: 'admin.paymentReview.list',
    scope: 'platform',
    networkContext: 'admin',
  },
  async ({ actor }) => {
    if (!actor || !(await canReadReviews(actor))) throw new ForbiddenError();
    return { data: await listReviewQueue() };
  },
);
