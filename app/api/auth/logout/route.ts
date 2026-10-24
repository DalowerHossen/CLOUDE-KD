// path: app/api/auth/logout/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { signOutCurrent } from '@/services/auth/session-ops';

const body = z.object({ everywhere: z.boolean().default(false) }).strict();

export const POST = withApi(
  {
    id: 'auth.logout',
    scope: 'public',
    body,
    auditExempt: 'The sign-out is recorded in auth_login_events.',
  },
  async ({ body: input }) => ({ data: await signOutCurrent(input.everywhere) }),
);
