// path: app/api/accounting/reconciliation/auto-match/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { autoMatchAll } from '@/services/reconciliation/matching';

export const POST = withApi(
  {
    id: 'bank.auto-match',
    scope: 'tenant',
    permission: { action: 'accounting.reconcile', resourceType: 'bank_account' },
    body: z.strictObject({ bankAccountId: z.string().uuid() }),
    idempotent: true,
    auditExempt: 'The matching service writes the audit entry.',
  },
  async ({ actor, body }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await autoMatchAll(actor, body.bankAccountId) };
  },
);
