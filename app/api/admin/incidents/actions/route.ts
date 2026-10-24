// path: app/api/admin/incidents/actions/route.ts
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { incidentActionSchema, runIncidentAction } from '@/services/incident/incident-service';

export const POST = withApi(
  {
    id: 'admin.incidents.action',
    scope: 'platform',
    networkContext: 'admin',
    permission: { action: 'incident.manage', resourceType: 'incident' },
    stepUp: { maxAgeSeconds: 300 },
    body: incidentActionSchema,
    auditExempt: 'The incident service writes the audit entry.',
  },
  async ({ body, actor }) => {
    if (!actor) throw new ForbiddenError();
    await runIncidentAction(actor, body);
    return { data: { done: true } };
  },
);
