// path: app/api/accounting/reconciliation/accounts/[id]/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { bankAccountUpdate } from '@/services/reconciliation/inputs';
import { updateBankAccount } from '@/services/reconciliation/bank-accounts';

export const PATCH = withApi(
  {
    id: 'bank.accounts.update',
    scope: 'tenant',
    permission: { action: 'accounting.reconcile', resourceType: 'bank_account' },
    params: z.object({ id: z.string().uuid() }).strict(),
    body: bankAccountUpdate,
    auditExempt: 'The bank account service writes the audit entry.',
  },
  async ({ actor, params, body }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await updateBankAccount(actor, params.id, body) };
  },
);
