// path: app/api/accounting/budgets/[id]/decide/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { decideInput } from '@/services/budget/budget-rules';
import { decideBudget } from '@/services/budget/budgets';

export const POST = withApi(
  {
    id: 'accounting.budgets.decide',
    scope: 'tenant',
    permission: { action: 'accounting.budget.manage', resourceType: 'budget' },
    params: z.object({ id: z.string().uuid() }).strict(),
    body: decideInput,
    idempotent: true,
    auditExempt: 'The budget service writes the audit entry.',
  },
  async ({ actor, params, body }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await decideBudget(actor, params.id, body) };
  },
);
