// path: app/api/expenses/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { expenseInput } from '@/services/expense/expense-rules';
import { createExpense, listExpenses } from '@/services/expense/expenses';

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const GET = withApi(
  {
    id: 'expenses.list',
    scope: 'tenant',
    permission: { action: 'expense.read', resourceType: 'expense' },
    query: z.strictObject({
      status: z.enum(['pending', 'approved', 'rejected']).optional(),
      payment: z.enum(['unpaid', 'paid']).optional(),
      categoryId: z.string().uuid().optional(),
      from: day.optional(),
      to: day.optional(),
      q: z.string().max(60).optional(),
      limit: z.coerce.number().int().min(1).max(200).optional(),
      offset: z.coerce.number().int().min(0).max(100_000).optional(),
    }),
  },
  async ({ actor, query }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await listExpenses(actor, query) };
  },
);

export const POST = withApi(
  {
    id: 'expenses.create',
    scope: 'tenant',
    permission: { action: 'expense.create', resourceType: 'expense' },
    body: z.strictObject({ expense: expenseInput, confirmDuplicate: z.boolean().default(false) }),
    idempotent: true,
    auditExempt: 'The expense service writes the audit entry.',
  },
  async ({ actor, body }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return {
      status: 201,
      data: await createExpense(actor, body.expense, { confirmDuplicate: body.confirmDuplicate }),
    };
  },
);
