// path: app/api/payments/card-search/route.ts
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { tenantSearchInput } from '@/lib/payment/card-search-rules';
import { searchOwnPayments } from '@/services/payment/card-search';

/** An owner finds payments of the own company by the last four digits of the card. */
export const POST = withApi(
  {
    id: 'payments.cardSearch',
    scope: 'tenant',
    permission: { action: 'payment.read', resourceType: 'payment' },
    rateLimitPolicy: 'strict',
    body: tenantSearchInput,
    auditExempt: 'The search service writes one audit entry for every search.',
  },
  async ({ actor, body }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await searchOwnPayments(actor, body) };
  },
);
