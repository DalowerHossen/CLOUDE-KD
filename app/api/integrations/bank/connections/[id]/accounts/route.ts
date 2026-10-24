// path: app/api/integrations/bank/connections/[id]/accounts/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { listFeedAccounts } from '@/services/bankfeed/connections';

export const GET = withApi(
  {
    id: 'bankfeed.accounts.list',
    scope: 'tenant',
    permission: { action: 'bankfeed.read', resourceType: 'bank_feed_account' },
    params: z.object({ id: z.string().uuid() }).strict(),
  },
  async ({ actor, params }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await listFeedAccounts(actor.companyId, params.id) };
  },
);
