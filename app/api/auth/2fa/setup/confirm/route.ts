// path: app/api/auth/2fa/setup/confirm/route.ts
import { withApi } from '@/lib/api/with-api';
import { confirmPendingSetup, confirmSetupSchema } from '@/services/auth/second-factor-flow';
import { withMinDuration } from '@/services/auth/timing';

export const POST = withApi(
  {
    id: 'auth.2fa.setup.confirm',
    scope: 'public',
    networkContext: 'login',
    body: confirmSetupSchema,
    auditExempt:
      'The factor table is audited by its row trigger and the login flow writes the sign-in audit entry.',
  },
  async ({ body }) => ({ data: await withMinDuration(() => confirmPendingSetup(body)) }),
);
