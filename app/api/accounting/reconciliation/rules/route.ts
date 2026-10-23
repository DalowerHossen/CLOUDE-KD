// path: app/api/accounting/reconciliation/rules/route.ts
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { ruleInput } from '@/services/reconciliation/inputs';
import { createRule, listRules } from '@/services/reconciliation/rules';

export const GET = withApi(
  {
    id: 'bank.rules.list',
    scope: 'tenant',
    permission: { action: 'accounting.read', resourceType: 'bank_account' },
  },
  async ({ actor }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await listRules(actor.companyId) };
  },
);

export const POST = withApi(
  {
    id: 'bank.rules.create',
    scope: 'tenant',
    permission: { action: 'accounting.reconcile', resourceType: 'bank_account' },
    body: ruleInput,
    auditExempt: 'The rule service writes the audit entry.',
  },
  async ({ actor, body }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { status: 201, data: await createRule(actor, body) };
  },
);
