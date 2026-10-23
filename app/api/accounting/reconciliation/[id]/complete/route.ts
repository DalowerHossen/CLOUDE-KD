// path: app/api/accounting/reconciliation/[id]/complete/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { completeInput } from '@/services/reconciliation/inputs';
import { completeReconciliation } from '@/services/reconciliation/reconcile';

export const POST = withApi(
  {
    id: 'bank.reconciliations.complete',
    scope: 'tenant',
    permission: { action: 'accounting.reconcile', resourceType: 'bank_account' },
    params: z.object({ id: z.string().uuid() }).strict(),
    body: completeInput,
    idempotent: true,
    auditExempt: 'The reconciliation service writes the audit entry.',
  },
  async ({ actor, params, body }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await completeReconciliation(actor, params.id, body) };
  },
);
