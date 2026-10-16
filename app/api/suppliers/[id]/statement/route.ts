// path: app/api/suppliers/[id]/statement/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { supplierStatementQuery } from '@/lib/procurement/bills';
import { supplierStatement } from '@/services/purchase/statements';

export const GET = withApi(
  {
    id: 'suppliers.statement',
    scope: 'tenant',
    permission: { action: 'bill.read', resourceType: 'supplier_bill' },
    params: z.object({ id: z.string().uuid() }).strict(),
    query: supplierStatementQuery,
  },
  async ({ actor, params: p, query }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await supplierStatement(actor.companyId, p.id, query) };
  },
);
