// path: app/api/auth/signup/route.ts
import { withApi } from '@/lib/api/with-api';
import { NEUTRAL_SIGNUP_MESSAGE, signupSchema, startSignup } from '@/services/auth/signup-flow';
import { withMinDuration } from '@/services/auth/timing';

export const POST = withApi(
  {
    id: 'auth.signup',
    scope: 'public',
    networkContext: 'signup',
    body: signupSchema,
    auditExempt: 'The sign-up flow writes the audit entry for new accounts.',
  },
  async ({ body, ip }) => {
    await withMinDuration(() => startSignup(body, ip));
    return { status: 202, data: { message: NEUTRAL_SIGNUP_MESSAGE } };
  },
);
