// path: app/api/companies/admin/flags/route.ts
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { flagSchema } from '@/lib/company/ops-input';
import { listFlags, saveFlag } from '@/services/company/flags';

export const GET = withApi(
  {
    id: 'admin.flags.list',
    scope: 'platform',
    networkContext: 'admin',
    permission: { action: 'flags.read', resourceType: 'feature_flag' },
  },
  async () => ({ data: await listFlags() }),
);

export const PUT = withApi(
  {
    id: 'admin.flags.save',
    scope: 'platform',
    networkContext: 'admin',
    permission: { action: 'flags.manage', resourceType: 'feature_flag' },
    stepUp: { maxAgeSeconds: 300 },
    body: flagSchema,
    auditExempt: 'The service writes the audit entry.',
  },
  async ({ actor, body }) => {
    if (!actor) throw new ForbiddenError();
    return { data: await saveFlag(actor, body) };
  },
);
