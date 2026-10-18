// path: app/api/portal/link-requests/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { listLinkRequests } from '@/services/portal/link-requests';

export const GET = withApi(
  {
    id: 'portal.linkRequests.list',
    scope: 'tenant',
    permission: { action: 'portal.link.decide', resourceType: 'link_request' },
    query: z.strictObject({ status: z.enum(['pending', 'approved', 'denied']).optional() }),
  },
  async ({ actor, query }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await listLinkRequests(actor.companyId, query.status) };
  },
);
