// path: app/api/wallet/bnpl/route.ts
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { bnplFormInput, formToSettings } from '@/lib/payment/bnpl-rules';
import { loadBnplRules, saveBnplSettings } from '@/services/bnpl/settings';

export const GET = withApi(
  {
    id: 'bnpl.rules',
    scope: 'tenant',
    permission: { action: 'client_subscription.read', resourceType: 'bnpl' },
  },
  async ({ actor }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await loadBnplRules(actor.companyId) };
  },
);

export const PUT = withApi(
  {
    id: 'bnpl.settings',
    scope: 'tenant',
    permission: { action: 'client_subscription.manage', resourceType: 'bnpl' },
    body: bnplFormInput,
    auditExempt: 'The settings service writes the audit entry.',
  },
  async ({ actor, body }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    await saveBnplSettings(actor, actor.companyId, formToSettings(body));
    return { data: await loadBnplRules(actor.companyId) };
  },
);
