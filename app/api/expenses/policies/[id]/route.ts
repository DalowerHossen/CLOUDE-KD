// path: app/api/expenses/policies/[id]/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { removePolicy, setPolicyStatus } from '@/services/expense/policies';

export const PATCH = withApi(
  {
    id: 'expenses.policies.status',
    scope: 'tenant',
    permission: { action: 'expense.manage', resourceType: 'expense_policy' },
    params: z.object({ id: z.string().uuid() }).strict(),
    body: z.strictObject({ status: z.enum(['active', 'inactive']) }),
    auditExempt: 'The policy service writes the audit entry.',
  },
  async ({ actor, params, body }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await setPolicyStatus(actor, params.id, body.status) };
  },
);

export const DELETE = withApi(
  {
    id: 'expenses.policies.remove',
    scope: 'tenant',
    permission: { action: 'expense.manage', resourceType: 'expense_policy' },
    params: z.object({ id: z.string().uuid() }).strict(),
    auditExempt: 'The policy service writes the audit entry.',
  },
  async ({ actor, params }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    await removePolicy(actor, params.id);
    return { data: { removed: true } };
  },
);
