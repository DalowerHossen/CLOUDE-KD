// path: app/api/expenses/reports/[report]/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { dayText } from '@/services/accounting/journal-rules';
import { EXPENSE_REPORT_KEYS, expenseReport } from '@/services/expense/reports';

export const GET = withApi(
  {
    id: 'expenses.reports.run',
    scope: 'tenant',
    permission: { action: 'expense.read', resourceType: 'expense' },
    params: z.object({ report: z.enum(EXPENSE_REPORT_KEYS) }).strict(),
    query: z.strictObject({ from: dayText, to: dayText }),
  },
  async ({ actor, params, query }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await expenseReport(actor, params.report, query.from, query.to) };
  },
);
