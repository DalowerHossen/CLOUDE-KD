// path: app/api/accounting/budgets/copy/route.ts
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { copyInput } from '@/services/budget/budget-rules';
import { copyBudget } from '@/services/budget/budgets';

export const POST = withApi(
  {
    id: 'accounting.budgets.copy',
    scope: 'tenant',
    permission: { action: 'accounting.budget.edit', resourceType: 'budget' },
    body: copyInput,
    idempotent: true,
    auditExempt: 'The budget service writes the audit entry.',
  },
  async ({ actor, body }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { status: 201, data: await copyBudget(actor, body) };
  },
);
