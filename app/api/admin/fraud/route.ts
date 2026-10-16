// path: app/api/admin/fraud/route.ts
import { withApi } from '@/lib/api/with-api';
import { fraudOverview } from '@/services/fraud/admin-ops';

export const GET = withApi(
  {
    id: 'admin.fraud.overview',
    scope: 'platform',
    networkContext: 'admin',
    permission: { action: 'fraud.read', resourceType: 'fraud' },
  },
  async () => ({ data: await fraudOverview() }),
);
