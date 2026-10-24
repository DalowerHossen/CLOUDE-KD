// path: app/api/payments/route.ts
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError, ValidationError } from '@/lib/errors';
import { toInt } from '@/lib/reports/numbers';
import { createPaymentBodySchema, paymentListQuery } from '@/schemas/payment/payments';
import { listPayments, startPayment } from '@/services/payment/payments';

export const GET = withApi(
  {
    id: 'payments.list',
    scope: 'tenant',
    permission: { action: 'payment.read', resourceType: 'payment' },
    query: paymentListQuery,
  },
  async ({ actor, query }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return {
      data: await listPayments(actor.companyId, {
        status: query.status,
        invoiceId: query.invoiceId,
        limit: Math.min(toInt(query.limit, 50), 200),
      }),
    };
  },
);

export const POST = withApi(
  {
    id: 'payments.create',
    scope: 'tenant',
    networkContext: 'payment',
    permission: { action: 'payment.create', resourceType: 'payment' },
    rateLimitPolicy: 'strict',
    idempotent: true,
    body: createPaymentBodySchema,
    auditExempt: 'The payment service writes the audit entry of every payment step.',
  },
  async ({ actor, body, idempotencyKey, ip }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    if (!idempotencyKey) throw new ValidationError('The Idempotency-Key header is required.');
    const payment = await startPayment(
      {
        invoiceId: body.invoiceId,
        idempotencyKey,
        paymentToken: body.paymentToken,
        billingPostalCode: body.billingPostalCode,
        payerIp: ip,
        returnUrl: body.returnUrl,
      },
      { createdBy: actor.userId },
    );
    return { status: 201, data: payment };
  },
);
