// path: app/api/admin/impersonation/start/route.ts
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { impersonationStartSchema, startImpersonation } from '@/services/auth/impersonation-flow';

export const POST = withApi(
  {
    id: 'admin.impersonation.start',
    scope: 'platform',
    roles: ['super_admin'],
    networkContext: 'admin',
    permission: { action: 'auth.impersonate', resourceType: 'impersonation_session' },
    stepUp: { maxAgeSeconds: 300 },
    body: impersonationStartSchema,
    auditExempt: 'The impersonation service writes the audit entry before the session changes.',
  },
  async ({ body, actor }) => {
    if (!actor) throw new ForbiddenError();
    return { status: 201, data: await startImpersonation(actor, body) };
  },
);
