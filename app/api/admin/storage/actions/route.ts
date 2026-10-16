// path: app/api/admin/storage/actions/route.ts
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { adminActionSchema, runAdminAction } from '@/services/storage/admin-ops';

export const POST = withApi(
  {
    id: 'admin.storage.action',
    scope: 'platform',
    networkContext: 'admin',
    permission: { action: 'storage.admin', resourceType: 'storage' },
    stepUp: { maxAgeSeconds: 300 },
    body: adminActionSchema,
    auditExempt: 'The storage services write the audit entries.',
  },
  async ({ body, actor }) => {
    if (!actor) throw new ForbiddenError();
    await runAdminAction(actor, body);
    return { data: { done: true } };
  },
);
