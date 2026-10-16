// path: app/api/admin/alerts/actions/route.ts
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { alertActionSchema, runAlertAction } from '@/services/alerting/alert-service';

export const POST = withApi(
  {
    id: 'admin.alerts.action',
    scope: 'platform',
    networkContext: 'admin',
    permission: { action: 'alert.manage', resourceType: 'alert' },
    stepUp: { maxAgeSeconds: 300 },
    body: alertActionSchema,
    auditExempt: 'The alert service writes the audit entry.',
  },
  async ({ body, actor }) => {
    if (!actor) throw new ForbiddenError();
    await runAlertAction(actor, body);
    return { data: { done: true } };
  },
);
