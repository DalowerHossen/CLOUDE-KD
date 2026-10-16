// path: app/api/admin/incidents/route.ts
import { withApi } from '@/lib/api/with-api';
import { incidentOverview } from '@/services/incident/incident-service';

export const GET = withApi(
  {
    id: 'admin.incidents.overview',
    scope: 'platform',
    networkContext: 'admin',
    permission: { action: 'incident.read', resourceType: 'incident' },
  },
  async () => ({ data: await incidentOverview() }),
);
