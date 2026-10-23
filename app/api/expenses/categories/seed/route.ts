// path: app/api/expenses/categories/seed/route.ts
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { ensureCategories } from '@/services/expense/categories';

export const POST = withApi(
  {
    id: 'expenses.categories.seed',
    scope: 'tenant',
    permission: { action: 'expense.manage', resourceType: 'expense_category' },
    auditExempt: 'The category service writes the audit entry.',
  },
  async ({ actor }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: { made: await ensureCategories(actor) } };
  },
);
