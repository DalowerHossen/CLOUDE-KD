// path: app/api/accounting/posting/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { listPostingLog } from '@/services/accounting/posting';

export const GET = withApi(
  {
    id: 'accounting.posting.list',
    scope: 'tenant',
    permission: { action: 'accounting.read', resourceType: 'posting_log' },
    query: z.strictObject({
      status: z.enum(['posted', 'skipped', 'failed']).optional(),
      review: z.enum(['pending', 'done']).optional(),
      limit: z.coerce.number().int().min(1).max(500).optional(),
    }),
  },
  async ({ actor, query }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await listPostingLog(actor.companyId, query) };
  },
);
