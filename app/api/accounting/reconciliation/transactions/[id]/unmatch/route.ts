// path: app/api/accounting/reconciliation/transactions/[id]/unmatch/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { unmatch } from '@/services/reconciliation/matching';

export const POST = withApi(
  {
    id: 'bank.unmatch',
    scope: 'tenant',
    permission: { action: 'accounting.reconcile', resourceType: 'bank_account' },
    params: z.object({ id: z.string().uuid() }).strict(),
    auditExempt: 'The matching service writes the audit entry.',
  },
  async ({ actor, params }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await unmatch(actor, params.id) };
  },
);
