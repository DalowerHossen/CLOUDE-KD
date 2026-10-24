// path: app/api/accounting/budgets/[id]/variance/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { dayText } from '@/services/accounting/journal-rules';
import { budgetVariance } from '@/services/budget/variance';

export const GET = withApi(
  {
    id: 'accounting.budgets.variance',
    scope: 'tenant',
    permission: { action: 'accounting.read', resourceType: 'budget' },
    params: z.object({ id: z.string().uuid() }).strict(),
    query: z.strictObject({ through: dayText.optional() }),
  },
  async ({ actor, params, query }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await budgetVariance(actor.companyId, params.id, query.through) };
  },
);
