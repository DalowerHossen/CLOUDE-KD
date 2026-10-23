// path: app/api/accounting/reconciliation/accounts/route.ts
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { bankAccountInput } from '@/services/reconciliation/inputs';
import { createBankAccount, listBankAccounts } from '@/services/reconciliation/bank-accounts';

export const GET = withApi(
  {
    id: 'bank.accounts.list',
    scope: 'tenant',
    permission: { action: 'accounting.read', resourceType: 'bank_account' },
  },
  async ({ actor }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await listBankAccounts(actor.companyId) };
  },
);

export const POST = withApi(
  {
    id: 'bank.accounts.create',
    scope: 'tenant',
    permission: { action: 'accounting.reconcile', resourceType: 'bank_account' },
    body: bankAccountInput,
    auditExempt: 'The bank account service writes the audit entry.',
  },
  async ({ actor, body }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { status: 201, data: await createBankAccount(actor, body) };
  },
);
