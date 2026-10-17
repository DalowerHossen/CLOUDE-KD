// path: app/api/admin/payment-review/blocked-cards/route.ts
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { canReadReviews, listBlockedCards } from '@/services/payment/reviews';

export const GET = withApi(
  {
    id: 'admin.blockedCards.list',
    scope: 'platform',
    networkContext: 'admin',
  },
  async ({ actor }) => {
    if (!actor || !(await canReadReviews(actor))) throw new ForbiddenError();
    return { data: await listBlockedCards() };
  },
);
