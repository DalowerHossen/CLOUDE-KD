// path: app/api/purchase-orders/[id]/bill-draft/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { billDraftFromOrder } from '@/services/purchase/bills';

export const GET = withApi(
  {
    id: 'po.bill-draft',
    scope: 'tenant',
    permission: { action: 'bill.write', resourceType: 'supplier_bill' },
    params: z.object({ id: z.string().uuid() }).strict(),
  },
  async ({ actor, params: p }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await billDraftFromOrder(actor.companyId, p.id) };
  },
);
