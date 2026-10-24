// path: app/api/expenses/categories/route.ts
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { categoryInput } from '@/services/expense/expense-rules';
import { createCategory, listCategories } from '@/services/expense/categories';

export const GET = withApi(
  {
    id: 'expenses.categories.list',
    scope: 'tenant',
    permission: { action: 'expense.read', resourceType: 'expense_category' },
  },
  async ({ actor }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await listCategories(actor.companyId) };
  },
);

export const POST = withApi(
  {
    id: 'expenses.categories.create',
    scope: 'tenant',
    permission: { action: 'expense.manage', resourceType: 'expense_category' },
    body: categoryInput,
    auditExempt: 'The category service writes the audit entry.',
  },
  async ({ actor, body }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { status: 201, data: await createCategory(actor, body) };
  },
);
