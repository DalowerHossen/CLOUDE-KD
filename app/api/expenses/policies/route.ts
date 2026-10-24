// path: app/api/expenses/policies/route.ts
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { policyInput } from '@/services/expense/expense-rules';
import { createPolicy, listPolicies } from '@/services/expense/policies';

export const GET = withApi(
  {
    id: 'expenses.policies.list',
    scope: 'tenant',
    permission: { action: 'expense.read', resourceType: 'expense_policy' },
  },
  async ({ actor }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await listPolicies(actor.companyId) };
  },
);

export const POST = withApi(
  {
    id: 'expenses.policies.create',
    scope: 'tenant',
    permission: { action: 'expense.manage', resourceType: 'expense_policy' },
    body: policyInput,
    auditExempt: 'The policy service writes the audit entry.',
  },
  async ({ actor, body }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { status: 201, data: await createPolicy(actor, body) };
  },
);
