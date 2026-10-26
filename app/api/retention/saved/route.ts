// path: app/api/retention/saved/route.ts
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { savedSchema } from '@/lib/platform/retention';
import { recordSaved } from '@/services/platform/retention';

export const POST = withApi(
  {
    id: 'retention.saved',
    scope: 'tenant',
    permission: { action: 'subscription.manage', resourceType: 'subscription' },
    body: savedSchema,
    auditExempt: 'The service writes the audit entry.',
  },
  async ({ actor, body }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    await recordSaved(actor, body);
    return { data: { done: true } };
  },
);
