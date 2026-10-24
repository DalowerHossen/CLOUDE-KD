// path: app/api/auth/password/change/route.ts
import { withApi } from '@/lib/api/with-api';
import { changeOwnPassword, passwordChangeSchema, requireActor } from '@/services/auth/account-ops';
import { withMinDuration } from '@/services/auth/timing';

export const POST = withApi(
  {
    id: 'auth.password.change',
    scope: 'public',
    body: passwordChangeSchema,
    auditExempt: 'The service writes the audit entry.',
  },
  async ({ body }) => {
    const actor = await requireActor();
    await withMinDuration(() => changeOwnPassword(actor, body));
    return { data: { changed: true } };
  },
);
