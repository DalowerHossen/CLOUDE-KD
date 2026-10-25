// path: app/api/payment-links/checkout/[token]/pay/route.ts
import { withApi } from '@/lib/api/with-api';
import { ValidationError } from '@/lib/errors';
import { linkPayBodySchema, tokenParam } from '@/schemas/payment/payments';
import { payViaLink } from '@/services/payment/links';

export const POST = withApi(
  {
    id: 'paymentLinks.pay',
    scope: 'public',
    networkContext: 'payment',
    rateLimitPolicy: 'strict',
    idempotent: true,
    params: tokenParam,
    body: linkPayBodySchema,
    auditExempt: 'The payment service writes the audit entry of every payment step.',
  },
  async ({ params, body, idempotencyKey, ip }) => {
    if (!idempotencyKey) throw new ValidationError('The Idempotency-Key header is required.');
    const result = await payViaLink(params.token, {
      paymentToken: body.paymentToken,
      billingPostalCode: body.billingPostalCode,
      returnUrl: body.returnUrl,
      idempotencyKey,
      payerIp: ip,
      embedOrigin: body.embedOrigin,
    });
    return { status: 201, data: result };
  },
);
