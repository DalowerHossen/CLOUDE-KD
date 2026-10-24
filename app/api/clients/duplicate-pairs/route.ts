// path: app/api/clients/duplicate-pairs/route.ts
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { duplicatePairs } from '@/services/client/duplicates';

/** The review list of pairs that look like the same client. */
export const GET = withApi(
  {
    id: 'clients.duplicate_pairs',
    scope: 'tenant',
    permission: { action: 'client.merge', resourceType: 'client' },
  },
  async ({ actor }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await duplicatePairs(actor.companyId) };
  },
);
