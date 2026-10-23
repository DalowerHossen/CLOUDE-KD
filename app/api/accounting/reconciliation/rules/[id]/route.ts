// path: app/api/accounting/reconciliation/rules/[id]/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { removeRule, setRuleStatus } from '@/services/reconciliation/rules';

export const PATCH = withApi(
  {
    id: 'bank.rules.status',
    scope: 'tenant',
    permission: { action: 'accounting.reconcile', resourceType: 'bank_account' },
    params: z.object({ id: z.string().uuid() }).strict(),
    body: z.strictObject({ status: z.enum(['active', 'inactive']) }),
    auditExempt: 'The rule service writes the audit entry.',
  },
  async ({ actor, params, body }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await setRuleStatus(actor, params.id, body.status) };
  },
);

export const DELETE = withApi(
  {
    id: 'bank.rules.remove',
    scope: 'tenant',
    permission: { action: 'accounting.reconcile', resourceType: 'bank_account' },
    params: z.object({ id: z.string().uuid() }).strict(),
    auditExempt: 'The rule service writes the audit entry.',
  },
  async ({ actor, params }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    await removeRule(actor, params.id);
    return { data: { removed: true } };
  },
);
