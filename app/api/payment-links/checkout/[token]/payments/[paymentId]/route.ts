// path: app/api/payment-links/checkout/[token]/payments/[paymentId]/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { linkPaymentStatus } from '@/services/payment/links';

const params = z
  .object({ token: z.string().regex(/^[A-Za-z0-9_-]{16,200}$/), paymentId: z.string().uuid() })
  .strict();

export const GET = withApi(
  {
    id: 'paymentLinks.status',
    scope: 'public',
    rateLimitPolicy: 'api-default',
    params,
  },
  async ({ params: p }) => ({ data: await linkPaymentStatus(p.token, p.paymentId) }),
);
