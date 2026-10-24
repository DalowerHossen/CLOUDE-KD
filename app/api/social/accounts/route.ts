// path: app/api/social/accounts/route.ts
import { withApi } from '@/lib/api/with-api';
import { SOCIAL_STEP_UP_SECONDS } from '@/config/s16-social';
import { ForbiddenError } from '@/lib/errors';
import { accountInput } from '@/lib/social/rules';
import { connectAccount, listAccounts } from '@/services/social/accounts';

export const GET = withApi(
  {
    id: 'social.accounts.list',
    scope: 'tenant',
    permission: { action: 'social.read', resourceType: 'social_account' },
  },
  async ({ actor }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await listAccounts(actor.companyId) };
  },
);

/** Connects an account. The token is sealed at once and never returned. */
export const POST = withApi(
  {
    id: 'social.accounts.connect',
    scope: 'tenant',
    permission: { action: 'social.manage', resourceType: 'social_account' },
    body: accountInput,
    stepUp: { maxAgeSeconds: SOCIAL_STEP_UP_SECONDS },
    auditExempt: 'The account service writes the audit entry.',
  },
  async ({ actor, body }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { status: 201, data: await connectAccount(actor, body) };
  },
);
