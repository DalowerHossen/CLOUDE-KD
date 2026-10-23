// path: app/api/auth/verify-email/route.ts
import { withApi } from '@/lib/api/with-api';
import { confirmEmail, verifyEmailSchema } from '@/services/auth/signup-flow';

export const POST = withApi(
  {
    id: 'auth.verify_email',
    scope: 'public',
    networkContext: 'signup',
    body: verifyEmailSchema,
    auditExempt: 'The verification is recorded in auth_login_events.',
  },
  async ({ body }) => ({ data: { verified: await confirmEmail(body.tokenHash) } }),
);
