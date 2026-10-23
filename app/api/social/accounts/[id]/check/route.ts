// path: app/api/social/accounts/[id]/check/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { checkAccount } from '@/services/social/accounts';

/** Asks the network for the name of the account to prove the token and the id belong together. */
export const POST = withApi(
  {
    id: 'social.accounts.check',
    scope: 'tenant',
    permission: { action: 'social.manage', resourceType: 'social_account' },
    params: z.object({ id: z.string().uuid() }).strict(),
    body: z.object({}).strict(),
    rateLimitPolicy: 'strict',
    auditExempt: 'The account service writes the audit entry.',
  },
  async ({ actor, params }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await checkAccount(actor, params.id) };
  },
);
