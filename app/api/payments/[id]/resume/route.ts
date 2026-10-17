// path: app/api/payments/[id]/resume/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { resumePayment } from '@/services/payment/payments';

const params = z.object({ id: z.string().uuid() }).strict();

export const POST = withApi(
  {
    id: 'payments.resume',
    scope: 'tenant',
    networkContext: 'payment',
    permission: { action: 'payment.create', resourceType: 'payment' },
    rateLimitPolicy: 'strict',
    params,
    auditExempt: 'The payment service writes the audit entry when the state changes.',
  },
  async ({ actor, params: p }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await resumePayment(actor.companyId, p.id) };
  },
);
