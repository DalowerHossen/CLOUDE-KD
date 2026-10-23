// path: app/api/expenses/recurring/[id]/history/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { recurringHistory } from '@/services/expense/recurring';

export const GET = withApi(
  {
    id: 'expenses.recurring.history',
    scope: 'tenant',
    permission: { action: 'expense.read', resourceType: 'recurring_expense' },
    params: z.object({ id: z.string().uuid() }).strict(),
  },
  async ({ actor, params }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await recurringHistory(actor.companyId, params.id) };
  },
);
