// path: app/api/admin/system/tenant-limits/route.ts
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { tenantLimitSchema } from '@/lib/platform/controls';
import { runTenantLimit } from '@/services/platform/controls';

const permission = { action: 'system.manage', resourceType: 'platform' } as const;

export const POST = withApi(
  {
    id: 'admin.system.tenant-limits',
    scope: 'platform',
    networkContext: 'admin',
    permission,
    stepUp: { maxAgeSeconds: 300 },
    body: tenantLimitSchema,
    auditExempt: 'The service writes the audit entry.',
  },
  async ({ actor, body }) => {
    if (!actor) throw new ForbiddenError();
    await runTenantLimit(actor, body);
    return { data: { done: true } };
  },
);
