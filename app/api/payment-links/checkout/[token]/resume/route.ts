// path: app/api/payment-links/checkout/[token]/resume/route.ts
import { withApi } from '@/lib/api/with-api';
import { linkResumeBodySchema, tokenParam } from '@/schemas/payment/payments';
import { resumeViaLink } from '@/services/payment/links';

export const POST = withApi(
  {
    id: 'paymentLinks.resume',
    scope: 'public',
    networkContext: 'payment',
    rateLimitPolicy: 'strict',
    params: tokenParam,
    body: linkResumeBodySchema,
    auditExempt: 'The payment service writes the audit entry when the state changes.',
  },
  async ({ params, body }) => ({ data: await resumeViaLink(params.token, body.paymentId) }),
);
