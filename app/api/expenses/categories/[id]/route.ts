// path: app/api/expenses/categories/[id]/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { categoryUpdate } from '@/services/expense/expense-rules';
import { updateCategory } from '@/services/expense/categories';

export const PATCH = withApi(
  {
    id: 'expenses.categories.update',
    scope: 'tenant',
    permission: { action: 'expense.manage', resourceType: 'expense_category' },
    params: z.object({ id: z.string().uuid() }).strict(),
    body: categoryUpdate,
    auditExempt: 'The category service writes the audit entry.',
  },
  async ({ actor, params, body }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await updateCategory(actor, params.id, body) };
  },
);
