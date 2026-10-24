// path: app/api/auth/login/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { startLogin } from '@/services/auth/login-flow';
import { withMinDuration } from '@/services/auth/timing';

const body = z
  .object({
    email: z.string().trim().toLowerCase().email().max(254),
    password: z.string().min(1).max(256),
    rememberMe: z.boolean().default(false),
    turnstileToken: z.string().min(1).max(4096).nullable().default(null),
  })
  .strict();

export const POST = withApi(
  {
    id: 'auth.login',
    scope: 'public',
    networkContext: 'login',
    body,
    auditExempt:
      'Sign-in events are written to auth_login_events and the audit log by the login flow.',
  },
  async ({ body: input, ip }) => ({
    data: await withMinDuration(() => startLogin({ ...input, ip })),
  }),
);
