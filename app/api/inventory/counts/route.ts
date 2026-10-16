// path: app/api/inventory/counts/route.ts
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { countStartSchema } from '@/lib/stock/documents';
import { listCounts, startCount } from '@/services/inventory/counts';

export const GET = withApi(
  {
    id: 'counts.list',
    scope: 'tenant',
    permission: { action: 'inventory.read', resourceType: 'stock_count' },
  },
  async ({ actor }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await listCounts(actor.companyId) };
  },
);

export const POST = withApi(
  {
    id: 'counts.start',
    scope: 'tenant',
    permission: { action: 'inventory.count', resourceType: 'stock_count' },
    body: countStartSchema,
    auditExempt: 'The count service writes the audit entry.',
  },
  async ({ actor, body }) => {
    if (!actor) throw new ForbiddenError();
    return { status: 201, data: { id: await startCount(actor, body) } };
  },
);
