// path: app/api/accounting/budgets/route.ts
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { budgetInput } from '@/services/budget/budget-rules';
import { createBudget, listBudgets } from '@/services/budget/budgets';

export const GET = withApi(
  {
    id: 'accounting.budgets.list',
    scope: 'tenant',
    permission: { action: 'accounting.read', resourceType: 'budget' },
  },
  async ({ actor }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await listBudgets(actor.companyId) };
  },
);

export const POST = withApi(
  {
    id: 'accounting.budgets.create',
    scope: 'tenant',
    permission: { action: 'accounting.budget.edit', resourceType: 'budget' },
    body: budgetInput,
    idempotent: true,
    auditExempt: 'The budget service writes the audit entry.',
  },
  async ({ actor, body }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { status: 201, data: await createBudget(actor, body) };
  },
);
