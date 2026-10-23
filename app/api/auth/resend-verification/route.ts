// path: app/api/auth/resend-verification/route.ts
import { withApi } from '@/lib/api/with-api';
import {
  NEUTRAL_SIGNUP_MESSAGE,
  resendSchema,
  resendVerification,
} from '@/services/auth/signup-flow';
import { withMinDuration } from '@/services/auth/timing';

export const POST = withApi(
  {
    id: 'auth.resend_verification',
    scope: 'public',
    networkContext: 'signup',
    body: resendSchema,
    auditExempt: 'No durable change is made for unknown or verified addresses.',
  },
  async ({ body, ip }) => {
    await withMinDuration(() => resendVerification(body, ip));
    return { status: 202, data: { message: NEUTRAL_SIGNUP_MESSAGE } };
  },
);
