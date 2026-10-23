// path: app/api/suppliers/[id]/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { supplierUpdateSchema } from '@/lib/procurement/suppliers';
import { deleteSupplier, getSupplier, updateSupplier } from '@/services/supplier/suppliers';

const params = z.object({ id: z.string().uuid() }).strict();

export const GET = withApi(
  {
    id: 'suppliers.get',
    scope: 'tenant',
    permission: { action: 'supplier.read', resourceType: 'supplier' },
    params,
  },
  async ({ actor, params: p }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await getSupplier(actor.companyId, p.id) };
  },
);

export const PUT = withApi(
  {
    id: 'suppliers.update',
    scope: 'tenant',
    permission: { action: 'supplier.write', resourceType: 'supplier' },
    params,
    body: supplierUpdateSchema,
    auditExempt: 'The supplier service writes the audit entry.',
  },
  async ({ actor, params: p, body }) => {
    if (!actor) throw new ForbiddenError();
    return { data: await updateSupplier(actor, p.id, body.expectedVersion, body.supplier) };
  },
);

export const DELETE = withApi(
  {
    id: 'suppliers.delete',
    scope: 'tenant',
    permission: { action: 'supplier.delete', resourceType: 'supplier' },
    params,
    auditExempt: 'The supplier service writes the audit entry.',
  },
  async ({ actor, params: p }) => {
    if (!actor) throw new ForbiddenError();
    await deleteSupplier(actor, p.id);
    return { data: { done: true } };
  },
);
