// path: app/api/admin/system/maintenance/route.ts
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { maintenanceSchema } from '@/lib/platform/controls';
import { setMaintenance } from '@/services/platform/controls';

const permission = { action: 'system.manage', resourceType: 'platform' } as const;

export const POST = withApi(
  {
    id: 'admin.system.maintenance',
    scope: 'platform',
    networkContext: 'admin',
    permission,
    stepUp: { maxAgeSeconds: 300 },
    body: maintenanceSchema,
    auditExempt: 'The service writes the audit entry.',
  },
  async ({ actor, body }) => {
    if (!actor) throw new ForbiddenError();
    await setMaintenance(actor, body);
    return { data: { done: true } };
  },
);
