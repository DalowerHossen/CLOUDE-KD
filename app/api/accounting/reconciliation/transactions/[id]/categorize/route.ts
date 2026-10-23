// path: app/api/accounting/reconciliation/transactions/[id]/categorize/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { categorizeInput } from '@/services/reconciliation/inputs';
import { categorize } from '@/services/reconciliation/matching';

export const POST = withApi(
  {
    id: 'bank.categorize',
    scope: 'tenant',
    permission: { action: 'accounting.reconcile', resourceType: 'bank_account' },
    params: z.object({ id: z.string().uuid() }).strict(),
    body: categorizeInput,
    idempotent: true,
    auditExempt: 'The matching service writes the audit entry.',
  },
  async ({ actor, params, body }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await categorize(actor, actor.companyId, params.id, body) };
  },
);
