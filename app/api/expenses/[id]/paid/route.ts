// path: app/api/expenses/[id]/paid/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { paidInput } from '@/services/expense/expense-rules';
import { markPaid } from '@/services/expense/expenses';

export const POST = withApi(
  {
    id: 'expenses.paid',
    scope: 'tenant',
    permission: { action: 'expense.manage', resourceType: 'expense' },
    params: z.object({ id: z.string().uuid() }).strict(),
    body: paidInput,
    idempotent: true,
    auditExempt: 'The expense service writes the audit entry.',
  },
  async ({ actor, params, body }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await markPaid(actor, params.id, body) };
  },
);
