// path: app/api/admin/account-locks/[id]/unlock/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { completeUnlock, unlockCompleteSchema } from '@/services/auth/unlock-flow';

export const POST = withApi(
  {
    id: 'admin.account_locks.unlock',
    scope: 'platform',
    networkContext: 'admin',
    permission: { action: 'auth.account.unlock', resourceType: 'account_lock' },
    stepUp: { maxAgeSeconds: 300 },
    params: z.object({ id: z.string().uuid() }).strict(),
    body: unlockCompleteSchema,
    auditExempt: 'The unlock service writes the audit entry.',
  },
  async ({ params, actor }) => {
    if (!actor) throw new ForbiddenError();
    await completeUnlock(actor, params.id);
    return { data: { unlocked: true } };
  },
);
