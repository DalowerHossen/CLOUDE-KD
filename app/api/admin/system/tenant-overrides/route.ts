// path: app/api/admin/system/tenant-overrides/route.ts
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { tenantOverrideSchema } from '@/lib/platform/tenant-overrides';
import { runOverride } from '@/services/platform/tenant-overrides';

export const POST = withApi(
  {
    id: 'admin.system.tenant-overrides',
    scope: 'platform',
    networkContext: 'admin',
    permission: { action: 'system.manage', resourceType: 'platform' },
    stepUp: { maxAgeSeconds: 300 },
    body: tenantOverrideSchema,
    auditExempt: 'The service writes the audit entry.',
  },
  async ({ actor, body }) => {
    if (!actor) throw new ForbiddenError();
    await runOverride(actor, body);
    return { data: { done: true } };
  },
);
