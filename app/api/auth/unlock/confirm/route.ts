// path: app/api/auth/unlock/confirm/route.ts
import { withApi } from '@/lib/api/with-api';
import { confirmUnlock, unlockConfirmSchema } from '@/services/auth/unlock-flow';
import { withMinDuration } from '@/services/auth/timing';

export const POST = withApi(
  {
    id: 'auth.unlock.confirm',
    scope: 'public',
    networkContext: 'login',
    body: unlockConfirmSchema,
    auditExempt: 'The unlock service writes the audit entry.',
  },
  async ({ body }) => ({
    data: { confirmed: await withMinDuration(() => confirmUnlock(body.token)) },
  }),
);
