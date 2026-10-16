// path: app/api/auth/step-up/route.ts
import { withApi } from '@/lib/api/with-api';
import { performStepUp, stepUpSchema } from '@/services/auth/step-up';
import { requireActor } from '@/services/auth/account-ops';

export const POST = withApi(
  {
    id: 'auth.step_up',
    scope: 'public',
    body: stepUpSchema,
    auditExempt:
      'The step-up time is kept on the session; failures feed the lock engine and auth_login_events.',
  },
  async ({ body }) => {
    await performStepUp(await requireActor(), body);
    return { data: { stepUp: true } };
  },
);
