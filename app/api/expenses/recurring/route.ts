// path: app/api/expenses/recurring/route.ts
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { recurringExpenseInput } from '@/services/expense/expense-rules';
import { createRecurringExpense, listRecurringExpenses } from '@/services/expense/recurring';

export const GET = withApi(
  {
    id: 'expenses.recurring.list',
    scope: 'tenant',
    permission: { action: 'expense.read', resourceType: 'recurring_expense' },
  },
  async ({ actor }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await listRecurringExpenses(actor.companyId) };
  },
);

export const POST = withApi(
  {
    id: 'expenses.recurring.create',
    scope: 'tenant',
    permission: { action: 'expense.manage', resourceType: 'recurring_expense' },
    body: recurringExpenseInput,
    auditExempt: 'The recurring service writes the audit entry.',
  },
  async ({ actor, body }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { status: 201, data: await createRecurringExpense(actor, body) };
  },
);
