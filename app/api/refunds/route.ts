// path: app/api/refunds/route.ts
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError, ValidationError } from '@/lib/errors';
import { Money } from '@/lib/utils/currency';
import { refundBodySchema } from '@/schemas/payment/payments';
import { refundPayment } from '@/services/payment/refunds';

export const POST = withApi(
  {
    id: 'refunds.create',
    scope: 'tenant',
    permission: { action: 'payment.refund', resourceType: 'payment' },
    rateLimitPolicy: 'strict',
    idempotent: true,
    body: refundBodySchema,
    auditExempt: 'The refund service writes the audit entry of every refund step.',
  },
  async ({ actor, body, idempotencyKey }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    if (!idempotencyKey) throw new ValidationError('The Idempotency-Key header is required.');
    const payment = await refundPayment(
      body.paymentId,
      Money.parse(body.amount),
      body.reason,
      idempotencyKey,
    );
    return { status: 201, data: payment };
  },
);
