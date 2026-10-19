// path: app/api/wallet/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { listItems, morStatus } from '@/services/mor/reports';

export const GET = withApi(
  {
    id: 'wallet.summary',
    scope: 'tenant',
    permission: { action: 'wallet.read', resourceType: 'wallet' },
    query: z.strictObject({}),
  },
  async ({ actor }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    const [status, items] = await Promise.all([
      morStatus(actor.companyId),
      listItems(actor.companyId, { limit: 20 }),
    ]);
    return { data: { status, items } };
  },
);
