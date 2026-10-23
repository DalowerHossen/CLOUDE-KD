// path: app/api/accounting/budgets/[id]/revise/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { reviseBudget } from '@/services/budget/budgets';

export const POST = withApi(
  {
    id: 'accounting.budgets.revise',
    scope: 'tenant',
    permission: { action: 'accounting.budget.manage', resourceType: 'budget' },
    params: z.object({ id: z.string().uuid() }).strict(),
    idempotent: true,
    auditExempt: 'The budget service writes the audit entry.',
  },
  async ({ actor, params }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await reviseBudget(actor, params.id) };
  },
);
