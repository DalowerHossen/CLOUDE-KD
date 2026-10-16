// path: app/api/auth/2fa/verify/route.ts
import { withApi } from '@/lib/api/with-api';
import { verifyCodeSchema, verifyLoginCode } from '@/services/auth/second-factor-flow';
import { withMinDuration } from '@/services/auth/timing';

export const POST = withApi(
  {
    id: 'auth.2fa.verify',
    scope: 'public',
    networkContext: 'login',
    body: verifyCodeSchema,
    auditExempt:
      'Sign-in events are written to auth_login_events and the audit log by the login flow.',
  },
  async ({ body }) => ({ data: await withMinDuration(() => verifyLoginCode(body)) }),
);
