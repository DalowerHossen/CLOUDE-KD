// path: app/api/auth/reset-password/route.ts
import { withApi } from '@/lib/api/with-api';
import { completeReset, resetSchema } from '@/services/auth/reset-flow';
import { withMinDuration } from '@/services/auth/timing';

export const POST = withApi(
  {
    id: 'auth.reset_password',
    scope: 'public',
    networkContext: 'login',
    body: resetSchema,
    auditExempt: 'The reset flow writes the audit entry.',
  },
  async ({ body, ip }) => {
    await withMinDuration(() => completeReset(body, ip));
    return { data: { reset: true } };
  },
);
