// path: app/api/payments/[id]/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { paymentDetail } from '@/services/payment/payment-detail';

const params = z.object({ id: z.string().uuid() }).strict();

export const GET = withApi(
  {
    id: 'payments.get',
    scope: 'tenant',
    permission: { action: 'payment.read', resourceType: 'payment' },
    params,
  },
  async ({ actor, params: p }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await paymentDetail(actor.companyId, p.id) };
  },
);
