// path: app/api/purchase-orders/[id]/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { getService } from '@/lib/container';
import { ForbiddenError } from '@/lib/errors';
import { poActionSchema, poUpdateSchema } from '@/lib/procurement/orders';
import { getOrder, runOrderAction, updateOrder } from '@/services/purchase/orders';

const params = z.object({ id: z.string().uuid() }).strict();

export const GET = withApi(
  {
    id: 'po.get',
    scope: 'tenant',
    permission: { action: 'po.read', resourceType: 'purchase_order' },
    params,
  },
  async ({ actor, params: p }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await getOrder(actor.companyId, p.id) };
  },
);

export const PUT = withApi(
  {
    id: 'po.update',
    scope: 'tenant',
    permission: { action: 'po.write', resourceType: 'purchase_order' },
    params,
    body: poUpdateSchema,
    auditExempt: 'The order service writes the audit entry.',
  },
  async ({ actor, params: p, body }) => {
    if (!actor) throw new ForbiddenError();
    return { data: await updateOrder(actor, p.id, body.expectedVersion, body.order) };
  },
);

export const POST = withApi(
  {
    id: 'po.action',
    scope: 'tenant',
    permission: { action: 'po.read', resourceType: 'purchase_order' },
    params,
    body: poActionSchema,
    auditExempt: 'The order service writes the audit entry.',
  },
  async ({ actor, params: p, body }) => {
    if (!actor) throw new ForbiddenError();
    // Each action also needs its own permission.
    const needed =
      body.action === 'send' ? 'po.send' : body.action === 'receive' ? 'po.receive' : 'po.write';
    if (!(await getService('permissions').can(actor, needed, { type: 'purchase_order' })))
      throw new ForbiddenError();
    return { data: await runOrderAction(actor, p.id, body) };
  },
);
