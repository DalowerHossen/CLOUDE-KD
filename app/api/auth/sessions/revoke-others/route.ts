// path: app/api/auth/sessions/revoke-others/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { requireActor, revokeOtherSessions } from '@/services/auth/account-ops';

export const POST = withApi(
  {
    id: 'auth.sessions.revoke_others',
    scope: 'public',
    body: z.object({}).strict(),
    auditExempt: 'The service writes the audit entry.',
  },
  async () => ({ data: { revoked: await revokeOtherSessions(await requireActor()) } }),
);
