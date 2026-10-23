// path: app/api/inventory/expiring/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { expiringBatches } from '@/services/inventory/valuation';

export const GET = withApi(
  {
    id: 'stock.expiring',
    scope: 'tenant',
    permission: { action: 'inventory.read', resourceType: 'stock' },
    query: z.object({ days: z.coerce.number().int().min(1).max(365).default(30) }).strict(),
  },
  async ({ actor, query }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await expiringBatches(actor.companyId, query.days) };
  },
);
