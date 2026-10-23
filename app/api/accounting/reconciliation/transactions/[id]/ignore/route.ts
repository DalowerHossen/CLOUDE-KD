// path: app/api/accounting/reconciliation/transactions/[id]/ignore/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { setIgnored } from '@/services/reconciliation/matching';

export const POST = withApi(
  {
    id: 'bank.ignore',
    scope: 'tenant',
    permission: { action: 'accounting.reconcile', resourceType: 'bank_account' },
    params: z.object({ id: z.string().uuid() }).strict(),
    body: z.strictObject({ ignored: z.boolean() }),
    auditExempt: 'The matching service writes the audit entry.',
  },
  async ({ actor, params, body }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await setIgnored(actor, params.id, body.ignored) };
  },
);
