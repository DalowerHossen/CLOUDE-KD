// path: app/api/accounting/reconciliation/transactions/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { dayText } from '@/services/accounting/journal-rules';
import { listTransactions } from '@/services/reconciliation/transactions';

export const GET = withApi(
  {
    id: 'bank.transactions.list',
    scope: 'tenant',
    permission: { action: 'accounting.read', resourceType: 'bank_account' },
    query: z.strictObject({
      accountId: z.string().uuid(),
      status: z.enum(['unmatched', 'matched', 'ignored']).optional(),
      from: dayText.optional(),
      to: dayText.optional(),
      limit: z.coerce.number().int().min(1).max(500).optional(),
      offset: z.coerce.number().int().min(0).max(100_000).optional(),
    }),
  },
  async ({ actor, query }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    const { accountId, ...filter } = query;
    return { data: await listTransactions(actor.companyId, accountId, filter) };
  },
);
