// path: app/api/auth/2fa/disable/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { disableOwnTwoFactor, requireActor } from '@/services/auth/account-ops';

export const POST = withApi(
  {
    id: 'auth.2fa.disable',
    scope: 'public',
    body: z.object({ confirm: z.literal(true) }).strict(),
    auditExempt: 'The service writes the audit entry.',
  },
  async () => {
    await disableOwnTwoFactor(await requireActor());
    return { data: { disabled: true } };
  },
);
