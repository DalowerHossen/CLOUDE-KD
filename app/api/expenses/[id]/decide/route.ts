// path: app/api/expenses/[id]/decide/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { decideInput } from '@/services/expense/expense-rules';
import { decideExpense } from '@/services/expense/expenses';

export const POST = withApi(
  {
    id: 'expenses.decide',
    scope: 'tenant',
    permission: { action: 'expense.approve', resourceType: 'expense' },
    params: z.object({ id: z.string().uuid() }).strict(),
    body: decideInput,
    idempotent: true,
    auditExempt: 'The expense service writes the audit entry.',
  },
  async ({ actor, params, body }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await decideExpense(actor, params.id, body) };
  },
);
