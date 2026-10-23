// path: app/api/admin/siem/route.ts
import { withApi } from '@/lib/api/with-api';
import { siemOverview } from '@/services/siem/siem-service';

export const GET = withApi(
  {
    id: 'admin.siem.overview',
    scope: 'platform',
    networkContext: 'admin',
    permission: { action: 'siem.read', resourceType: 'siem' },
  },
  async () => ({ data: await siemOverview() }),
);
