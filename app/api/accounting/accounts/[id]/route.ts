// path: app/api/accounting/accounts/[id]/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { accountUpdate } from '@/services/accounting/chart-rules';
import { getAccount, removeAccount, updateAccount } from '@/services/accounting/accounts';

const params = z.object({ id: z.string().uuid() }).strict();

export const GET = withApi(
  {
    id: 'accounting.accounts.get',
    scope: 'tenant',
    permission: { action: 'accounting.read', resourceType: 'account' },
    params,
  },
  async ({ actor, params: p }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await getAccount(actor.companyId, p.id) };
  },
);

export const PATCH = withApi(
  {
    id: 'accounting.accounts.update',
    scope: 'tenant',
    permission: { action: 'accounting.account.manage', resourceType: 'account' },
    params,
    body: accountUpdate,
    auditExempt: 'The account service writes the audit entry.',
  },
  async ({ actor, params: p, body }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await updateAccount(actor, p.id, body) };
  },
);

export const DELETE = withApi(
  {
    id: 'accounting.accounts.remove',
    scope: 'tenant',
    permission: { action: 'accounting.account.manage', resourceType: 'account' },
    params,
    auditExempt: 'The account service writes the audit entry.',
  },
  async ({ actor, params: p }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    await removeAccount(actor, p.id);
    return { data: { removed: true } };
  },
);
