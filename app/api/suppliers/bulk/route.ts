// path: app/api/suppliers/bulk/route.ts
import { withApi } from '@/lib/api/with-api';
import { getService } from '@/lib/container';
import { ForbiddenError } from '@/lib/errors';
import { supplierBulkSchema } from '@/lib/transfer/bulk';
import { bulkSuppliers } from '@/services/supplier/bulk';

export const POST = withApi(
  {
    id: 'suppliers.bulk',
    scope: 'tenant',
    permission: { action: 'supplier.bulk', resourceType: 'supplier' },
    rateLimitPolicy: 'strict',
    body: supplierBulkSchema,
    auditExempt: 'The bulk service writes the audit entry.',
  },
  async ({ actor, body }) => {
    if (!actor) throw new ForbiddenError();
    const needed = body.action === 'delete' ? 'supplier.delete' : 'supplier.write';
    if (!(await getService('permissions').can(actor, needed, { type: 'supplier' })))
      throw new ForbiddenError();
    return { data: await bulkSuppliers(actor, body) };
  },
);
