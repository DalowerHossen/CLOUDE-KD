// path: app/api/accounting/reconciliation/transactions/[id]/confirm/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { confirmInput } from '@/services/reconciliation/inputs';
import { confirmMatch } from '@/services/reconciliation/matching';

export const POST = withApi(
  {
    id: 'bank.confirm',
    scope: 'tenant',
    permission: { action: 'accounting.reconcile', resourceType: 'bank_account' },
    params: z.object({ id: z.string().uuid() }).strict(),
    body: confirmInput,
    idempotent: true,
    auditExempt: 'The matching service writes the audit entry.',
  },
  async ({ actor, params, body }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await confirmMatch(actor, params.id, body) };
  },
);
