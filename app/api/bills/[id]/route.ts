// path: app/api/bills/[id]/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { getService } from '@/lib/container';
import { ForbiddenError } from '@/lib/errors';
import { billActionSchema, billUpdateSchema } from '@/lib/procurement/bills';
import { getBill, runBillAction, updateBill } from '@/services/purchase/bills';

const params = z.object({ id: z.string().uuid() }).strict();

export const GET = withApi(
  {
    id: 'bills.get',
    scope: 'tenant',
    permission: { action: 'bill.read', resourceType: 'supplier_bill' },
    params,
  },
  async ({ actor, params: p }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await getBill(actor.companyId, p.id) };
  },
);

export const PUT = withApi(
  {
    id: 'bills.update',
    scope: 'tenant',
    permission: { action: 'bill.write', resourceType: 'supplier_bill' },
    params,
    body: billUpdateSchema,
    auditExempt: 'The bill service writes the audit entry.',
  },
  async ({ actor, params: p, body }) => {
    if (!actor) throw new ForbiddenError();
    return { data: await updateBill(actor, p.id, body.expectedVersion, body.bill) };
  },
);

export const POST = withApi(
  {
    id: 'bills.action',
    scope: 'tenant',
    permission: { action: 'bill.write', resourceType: 'supplier_bill' },
    params,
    body: billActionSchema,
    auditExempt: 'The bill service writes the audit entry.',
  },
  async ({ actor, params: p, body }) => {
    if (!actor) throw new ForbiddenError();
    if (
      body.action === 'post' &&
      body.override &&
      !(await getService('permissions').can(actor, 'bill.override', { type: 'supplier_bill' }))
    )
      throw new ForbiddenError();
    return { data: await runBillAction(actor, p.id, body) };
  },
);
