// path: app/api/accounting/accounts/[id]/history/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { accountHistory } from '@/services/accounting/accounts';

export const GET = withApi(
  {
    id: 'accounting.accounts.history',
    scope: 'tenant',
    permission: { action: 'accounting.read', resourceType: 'account' },
    params: z.object({ id: z.string().uuid() }).strict(),
  },
  async ({ actor, params }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await accountHistory(actor.companyId, params.id) };
  },
);
