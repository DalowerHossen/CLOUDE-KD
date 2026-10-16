// path: app/api/admin/account-locks/request/route.ts
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { requestUnlock, unlockRequestSchema } from '@/services/auth/unlock-flow';

export const POST = withApi(
  {
    id: 'admin.account_locks.request_unlock',
    scope: 'platform',
    networkContext: 'admin',
    permission: { action: 'auth.account.unlock', resourceType: 'account_lock' },
    stepUp: { maxAgeSeconds: 300 },
    body: unlockRequestSchema,
    auditExempt: 'The unlock service writes the audit entry.',
  },
  async ({ body, actor }) => {
    if (!actor) throw new ForbiddenError();
    return { status: 201, data: await requestUnlock(actor, body) };
  },
);
