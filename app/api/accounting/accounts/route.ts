// path: app/api/accounting/accounts/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { accountInput } from '@/services/accounting/chart-rules';
import { createAccount, listAccounts } from '@/services/accounting/accounts';

export const GET = withApi(
  {
    id: 'accounting.accounts.list',
    scope: 'tenant',
    permission: { action: 'accounting.read', resourceType: 'account' },
    query: z.strictObject({
      type: z.enum(['asset', 'liability', 'equity', 'revenue', 'expense']).optional(),
      status: z.enum(['active', 'inactive']).optional(),
      q: z.string().max(60).optional(),
    }),
  },
  async ({ actor, query }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await listAccounts(actor.companyId, query) };
  },
);

export const POST = withApi(
  {
    id: 'accounting.accounts.create',
    scope: 'tenant',
    permission: { action: 'accounting.account.manage', resourceType: 'account' },
    body: accountInput,
    auditExempt: 'The account service writes the audit entry.',
  },
  async ({ actor, body }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { status: 201, data: await createAccount(actor, body) };
  },
);
