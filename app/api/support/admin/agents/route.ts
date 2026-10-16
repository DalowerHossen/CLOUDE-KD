// path: app/api/support/admin/agents/route.ts
import { withApi } from '@/lib/api/with-api';
import { agents } from '@/services/support/tickets';

export const GET = withApi(
  {
    id: 'support.admin.agents',
    scope: 'platform',
    networkContext: 'admin',
    permission: { action: 'support.agent', resourceType: 'support_ticket' },
  },
  async () => ({ data: await agents() }),
);
