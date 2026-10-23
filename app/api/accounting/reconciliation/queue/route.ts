// path: app/api/accounting/reconciliation/queue/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { unmatchedQueue } from '@/services/reconciliation/matching';

export const GET = withApi(
  {
    id: 'bank.queue',
    scope: 'tenant',
    permission: { action: 'accounting.read', resourceType: 'bank_account' },
    query: z.strictObject({
      accountId: z.string().uuid(),
      limit: z.coerce.number().int().min(1).max(500).optional(),
    }),
  },
  async ({ actor, query }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await unmatchedQueue(actor.companyId, query.accountId, query.limit) };
  },
);
