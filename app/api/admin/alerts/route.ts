// path: app/api/admin/alerts/route.ts
import { withApi } from '@/lib/api/with-api';
import { alertsOverview } from '@/services/alerting/alert-service';

export const GET = withApi(
  {
    id: 'admin.alerts.overview',
    scope: 'platform',
    networkContext: 'admin',
    permission: { action: 'alert.read', resourceType: 'alert' },
  },
  async () => ({ data: await alertsOverview() }),
);
