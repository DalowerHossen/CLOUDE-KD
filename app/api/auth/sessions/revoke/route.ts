// path: app/api/auth/sessions/revoke/route.ts
import { withApi } from '@/lib/api/with-api';
import { requireActor, revokeSession, sessionRevokeSchema } from '@/services/auth/account-ops';

export const POST = withApi(
  {
    id: 'auth.sessions.revoke',
    scope: 'public',
    body: sessionRevokeSchema,
    auditExempt: 'The service writes the audit entry.',
  },
  async ({ body }) => {
    await revokeSession(await requireActor(), body.sessionId);
    return { data: { revoked: true } };
  },
);
