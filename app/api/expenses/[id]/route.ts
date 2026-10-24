// path: app/api/expenses/[id]/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { expenseUpdate } from '@/services/expense/expense-rules';
import { deleteExpense, getExpense, updateExpense } from '@/services/expense/expenses';

const params = z.object({ id: z.string().uuid() }).strict();

export const GET = withApi(
  {
    id: 'expenses.get',
    scope: 'tenant',
    permission: { action: 'expense.read', resourceType: 'expense' },
    params,
  },
  async ({ actor, params: p }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await getExpense(actor, p.id) };
  },
);

export const PUT = withApi(
  {
    id: 'expenses.update',
    scope: 'tenant',
    permission: { action: 'expense.create', resourceType: 'expense' },
    params,
    body: expenseUpdate,
    auditExempt: 'The expense service writes the audit entry.',
  },
  async ({ actor, params: p, body }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await updateExpense(actor, p.id, body) };
  },
);

export const DELETE = withApi(
  {
    id: 'expenses.delete',
    scope: 'tenant',
    permission: { action: 'expense.create', resourceType: 'expense' },
    params,
    auditExempt: 'The expense service writes the audit entry.',
  },
  async ({ actor, params: p }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    await deleteExpense(actor, p.id);
    return { data: { deleted: true } };
  },
);
