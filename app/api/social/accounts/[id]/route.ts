// path: app/api/social/accounts/[id]/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { SOCIAL_STEP_UP_SECONDS } from '@/config/s16-social';
import { ForbiddenError } from '@/lib/errors';
import { accountUpdate } from '@/lib/social/rules';
import { getAccount, removeAccount, updateAccount } from '@/services/social/accounts';

const params = z.object({ id: z.string().uuid() }).strict();

export const GET = withApi(
  {
    id: 'social.accounts.get',
    scope: 'tenant',
    permission: { action: 'social.read', resourceType: 'social_account' },
    params,
  },
  async ({ actor, params: p }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await getAccount(actor.companyId, p.id) };
  },
);

export const PATCH = withApi(
  {
    id: 'social.accounts.update',
    scope: 'tenant',
    permission: { action: 'social.manage', resourceType: 'social_account' },
    params,
    body: accountUpdate,
    stepUp: { maxAgeSeconds: SOCIAL_STEP_UP_SECONDS },
    auditExempt: 'The account service writes the audit entry.',
  },
  async ({ actor, params: p, body }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await updateAccount(actor, p.id, body) };
  },
);

/** Disconnects the account; its drafts and scheduled posts are cancelled. */
export const DELETE = withApi(
  {
    id: 'social.accounts.remove',
    scope: 'tenant',
    permission: { action: 'social.manage', resourceType: 'social_account' },
    params,
    stepUp: { maxAgeSeconds: SOCIAL_STEP_UP_SECONDS },
    auditExempt: 'The account service writes the audit entry.',
  },
  async ({ actor, params: p }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    await removeAccount(actor, p.id);
    return { data: { ok: true } };
  },
);
