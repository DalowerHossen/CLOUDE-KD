// path: app/api/bills/aging/route.ts
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { agingQuery } from '@/lib/procurement/bills';
import { payablesAging } from '@/services/purchase/statements';

export const GET = withApi(
  {
    id: 'bills.aging',
    scope: 'tenant',
    permission: { action: 'bill.read', resourceType: 'supplier_bill' },
    query: agingQuery,
  },
  async ({ actor, query }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return {
      data: await payablesAging(
        actor.companyId,
        query.asOf ?? new Date().toISOString().slice(0, 10),
      ),
    };
  },
);
