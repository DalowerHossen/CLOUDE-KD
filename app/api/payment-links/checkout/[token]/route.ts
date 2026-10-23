// path: app/api/payment-links/checkout/[token]/route.ts
// Public: what the hosted checkout page needs. The token is the only credential; every refusal is a 404.
import { withApi } from '@/lib/api/with-api';
import { tokenParam } from '@/schemas/payment/payments';
import { checkoutFor } from '@/services/payment/links';

export const GET = withApi(
  {
    id: 'paymentLinks.checkout',
    scope: 'public',
    networkContext: 'payment',
    rateLimitPolicy: 'strict',
    params: tokenParam,
  },
  async ({ params }) => ({ data: await checkoutFor(params.token) }),
);
