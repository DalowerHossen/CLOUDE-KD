// path: app/api/bills/route.ts
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { billInputSchema, billListQuery } from '@/lib/procurement/bills';
import { createBill, listBills } from '@/services/purchase/bills';

export const GET = withApi(
  {
    id: 'bills.list',
    scope: 'tenant',
    permission: { action: 'bill.read', resourceType: 'supplier_bill' },
    query: billListQuery,
  },
  async ({ actor, query }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await listBills(actor.companyId, query) };
  },
);

export const POST = withApi(
  {
    id: 'bills.create',
    scope: 'tenant',
    permission: { action: 'bill.write', resourceType: 'supplier_bill' },
    body: billInputSchema,
    auditExempt: 'The bill service writes the audit entry.',
  },
  async ({ actor, body }) => {
    if (!actor) throw new ForbiddenError();
    return { status: 201, data: await createBill(actor, body) };
  },
);
