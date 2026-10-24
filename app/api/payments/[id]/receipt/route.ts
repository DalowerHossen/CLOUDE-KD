// path: app/api/payments/[id]/receipt/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { receiptData } from '@/services/payment/receipt-data';

const params = z.object({ id: z.string().uuid() }).strict();

export const GET = withApi(
  {
    id: 'payments.receipt',
    scope: 'tenant',
    permission: { action: 'payment.read', resourceType: 'payment' },
    params,
  },
  async ({ actor, params: p }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await receiptData(actor.companyId, p.id) };
  },
);
