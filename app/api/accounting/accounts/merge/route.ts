// path: app/api/accounting/accounts/merge/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { mergeAccounts } from '@/services/accounting/accounts';

export const POST = withApi(
  {
    id: 'accounting.accounts.merge',
    scope: 'tenant',
    permission: { action: 'accounting.account.manage', resourceType: 'account' },
    body: z.strictObject({ fromId: z.string().uuid(), toId: z.string().uuid() }),
    auditExempt: 'The account service writes the audit entry.',
  },
  async ({ actor, body }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await mergeAccounts(actor, body.fromId, body.toId) };
  },
);
