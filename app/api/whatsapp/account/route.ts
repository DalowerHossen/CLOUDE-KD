// path: app/api/whatsapp/account/route.ts
import { withApi } from '@/lib/api/with-api';
import { WHATSAPP_STEP_UP_SECONDS } from '@/config/s16-whatsapp';
import { ForbiddenError } from '@/lib/errors';
import { accountInput, accountUpdate } from '@/lib/whatsapp/rules';
import { connectAccount, getAccount, updateAccount } from '@/services/whatsapp/accounts';

export const GET = withApi(
  {
    id: 'whatsapp.account.get',
    scope: 'tenant',
    permission: { action: 'whatsapp.read', resourceType: 'whatsapp_account' },
  },
  async ({ actor }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await getAccount(actor.companyId) };
  },
);

/** Connects WhatsApp. The verify token is in this one answer only, so the route is not idempotent. */
export const POST = withApi(
  {
    id: 'whatsapp.account.connect',
    scope: 'tenant',
    permission: { action: 'whatsapp.manage', resourceType: 'whatsapp_account' },
    body: accountInput,
    stepUp: { maxAgeSeconds: WHATSAPP_STEP_UP_SECONDS },
    auditExempt: 'The account service writes the audit entry.',
  },
  async ({ actor, body }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { status: 201, data: await connectAccount(actor, body) };
  },
);

export const PATCH = withApi(
  {
    id: 'whatsapp.account.update',
    scope: 'tenant',
    permission: { action: 'whatsapp.manage', resourceType: 'whatsapp_account' },
    body: accountUpdate,
    stepUp: { maxAgeSeconds: WHATSAPP_STEP_UP_SECONDS },
    auditExempt: 'The account service writes the audit entry.',
  },
  async ({ actor, body }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await updateAccount(actor, body) };
  },
);
