// path: app/api/auth/forgot-password/route.ts
import { withApi } from '@/lib/api/with-api';
import { NEUTRAL_RESET_MESSAGE, forgotSchema, requestReset } from '@/services/auth/reset-flow';
import { withMinDuration } from '@/services/auth/timing';

export const POST = withApi(
  {
    id: 'auth.forgot_password',
    scope: 'public',
    networkContext: 'login',
    body: forgotSchema,
    auditExempt:
      'The request is recorded in auth_login_events (reset_requested or reset_suppressed).',
  },
  async ({ body, ip }) => {
    await withMinDuration(() => requestReset(body, ip));
    return { status: 202, data: { message: NEUTRAL_RESET_MESSAGE } };
  },
);
