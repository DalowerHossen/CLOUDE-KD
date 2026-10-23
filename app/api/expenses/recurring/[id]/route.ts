// path: app/api/expenses/recurring/[id]/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { removeRecurringExpense, setRecurringExpenseStatus } from '@/services/expense/recurring';

export const PATCH = withApi(
  {
    id: 'expenses.recurring.status',
    scope: 'tenant',
    permission: { action: 'expense.manage', resourceType: 'recurring_expense' },
    params: z.object({ id: z.string().uuid() }).strict(),
    body: z.strictObject({ status: z.enum(['active', 'paused']) }),
    auditExempt: 'The recurring service writes the audit entry.',
  },
  async ({ actor, params, body }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await setRecurringExpenseStatus(actor, params.id, body.status) };
  },
);

export const DELETE = withApi(
  {
    id: 'expenses.recurring.remove',
    scope: 'tenant',
    permission: { action: 'expense.manage', resourceType: 'recurring_expense' },
    params: z.object({ id: z.string().uuid() }).strict(),
    auditExempt: 'The recurring service writes the audit entry.',
  },
  async ({ actor, params }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    await removeRecurringExpense(actor, params.id);
    return { data: { removed: true } };
  },
);
