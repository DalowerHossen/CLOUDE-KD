// path: app/api/admin/payments/card-search/route.ts
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { platformSearchInput } from '@/lib/payment/card-search-rules';
import { searchAllPayments } from '@/services/payment/card-search';

/** Platform staff: find payments of all companies by the last four digits of the card (POST, so the digits stay out of addresses). */
export const POST = withApi(
  {
    id: 'admin.payments.cardSearch',
    scope: 'platform',
    networkContext: 'admin',
    permission: { action: 'payment.card.search', resourceType: 'payment' },
    rateLimitPolicy: 'strict',
    body: platformSearchInput,
    auditExempt: 'The search service writes one audit entry for every search.',
  },
  async ({ actor, body }) => {
    if (!actor) throw new ForbiddenError();
    return { data: await searchAllPayments(actor, body) };
  },
);
