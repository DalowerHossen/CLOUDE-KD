// path: app/api/accounting/reconciliation/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { startInput } from '@/services/reconciliation/inputs';
import { reconciliationHistory, startReconciliation } from '@/services/reconciliation/reconcile';

export const GET = withApi(
  {
    id: 'bank.reconciliations.history',
    scope: 'tenant',
    permission: { action: 'accounting.read', resourceType: 'bank_account' },
    query: z.strictObject({ accountId: z.string().uuid() }),
  },
  async ({ actor, query }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await reconciliationHistory(actor.companyId, query.accountId) };
  },
);

export const POST = withApi(
  {
    id: 'bank.reconciliations.start',
    scope: 'tenant',
    permission: { action: 'accounting.reconcile', resourceType: 'bank_account' },
    body: startInput,
    idempotent: true,
    auditExempt: 'The reconciliation service writes the audit entry.',
  },
  async ({ actor, body }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { status: 201, data: await startReconciliation(actor, body) };
  },
);
