// path: app/api/auth/2fa/enroll/confirm/route.ts
import { withApi } from '@/lib/api/with-api';
import { codeSchema, confirmAccountEnrollment, requireActor } from '@/services/auth/account-ops';

export const POST = withApi(
  {
    id: 'auth.2fa.enroll.confirm',
    scope: 'public',
    body: codeSchema,
    auditExempt: 'The service writes the audit entry.',
  },
  async ({ body }) => ({
    data: { backupCodes: await confirmAccountEnrollment(await requireActor(), body.code) },
  }),
);
