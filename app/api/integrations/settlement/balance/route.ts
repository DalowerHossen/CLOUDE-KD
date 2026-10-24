// path: app/api/integrations/settlement/balance/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { balanceOfSub } from '@/services/gateway/balances';

const query = z.object({ subMerchantId: z.string().uuid() }).strict();

export const GET = withApi(
  {
    id: 'settlement.balance.get',
    scope: 'tenant',
    permission: { action: 'settlement.read', resourceType: 'settlement_entry' },
    query,
  },
  async ({ actor, query: q }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await balanceOfSub(actor.companyId, q.subMerchantId) };
  },
);
