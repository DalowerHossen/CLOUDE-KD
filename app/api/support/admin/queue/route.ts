// path: app/api/support/admin/queue/route.ts
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { queueQuery } from '@/lib/support/rules';
import { queue } from '@/services/support/tickets';

export const GET = withApi(
  {
    id: 'support.admin.queue',
    scope: 'platform',
    networkContext: 'admin',
    permission: { action: 'support.agent', resourceType: 'support_ticket' },
    query: queueQuery,
  },
  async ({ actor, query }) => {
    if (!actor) throw new ForbiddenError();
    return { data: await queue(actor, query) };
  },
);
