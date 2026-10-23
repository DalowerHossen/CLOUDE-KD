// path: app/api/wallet/bnpl/platform/route.ts
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { bnplFormInput, formToSettings } from '@/lib/payment/bnpl-rules';
import { saveBnplSettings } from '@/services/bnpl/settings';

export const PUT = withApi(
  {
    id: 'bnpl.platform-settings',
    scope: 'platform',
    networkContext: 'admin',
    roles: ['super_admin'],
    permission: { action: 'subscription.admin', resourceType: 'bnpl' },
    body: bnplFormInput,
    auditExempt: 'The settings service writes the audit entry.',
  },
  async ({ actor, body }) => {
    if (!actor) throw new ForbiddenError();
    await saveBnplSettings(actor, null, formToSettings(body));
    return { data: { saved: true } };
  },
);
