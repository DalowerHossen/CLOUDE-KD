// path: app/api/suppliers/[id]/status/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { supplierStatusSchema } from '@/lib/procurement/suppliers';
import { setSupplierStatus } from '@/services/supplier/suppliers';

export const POST = withApi(
  {
    id: 'suppliers.status',
    scope: 'tenant',
    permission: { action: 'supplier.write', resourceType: 'supplier' },
    params: z.object({ id: z.string().uuid() }).strict(),
    body: supplierStatusSchema,
    auditExempt: 'The supplier service writes the audit entry.',
  },
  async ({ actor, params: p, body }) => {
    if (!actor) throw new ForbiddenError();
    return { data: await setSupplierStatus(actor, p.id, body.action) };
  },
);
