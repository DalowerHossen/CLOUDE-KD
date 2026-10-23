// path: app/api/suppliers/route.ts
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { supplierInputSchema, supplierListQuery } from '@/lib/procurement/suppliers';
import { createSupplier, searchSuppliers } from '@/services/supplier/suppliers';

export const GET = withApi(
  {
    id: 'suppliers.list',
    scope: 'tenant',
    permission: { action: 'supplier.read', resourceType: 'supplier' },
    query: supplierListQuery,
  },
  async ({ actor, query }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await searchSuppliers(actor.companyId, query) };
  },
);

export const POST = withApi(
  {
    id: 'suppliers.create',
    scope: 'tenant',
    permission: { action: 'supplier.write', resourceType: 'supplier' },
    body: supplierInputSchema,
    auditExempt: 'The supplier service writes the audit entry.',
  },
  async ({ actor, body }) => {
    if (!actor) throw new ForbiddenError();
    return { status: 201, data: await createSupplier(actor, body) };
  },
);
