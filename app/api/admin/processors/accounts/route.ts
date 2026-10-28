// path: app/api/admin/processors/accounts/route.ts
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { saveAccountInput } from '@/lib/payment/company-accounts-rules';
import { accountFormOptions, listAccounts, saveAccount } from '@/services/payment/company-accounts';
import { listCompanies } from '@/services/payment/onboarding';

export const GET = withApi(
  {
    id: 'admin.accounts.list',
    scope: 'platform',
    roles: ['super_admin'],
    networkContext: 'admin',
    permission: { action: 'payment.processor.view', resourceType: 'processor' },
  },
  async () => ({
    data: {
      accounts: await listAccounts(),
      companies: await listCompanies(),
      processors: await accountFormOptions(),
    },
  }),
);

export const POST = withApi(
  {
    id: 'admin.accounts.save',
    scope: 'platform',
    roles: ['super_admin'],
    networkContext: 'admin',
    permission: { action: 'payment.processor.manage', resourceType: 'processor' },
    stepUp: { maxAgeSeconds: 300 },
    rateLimitPolicy: 'strict',
    body: saveAccountInput,
    auditExempt: 'The accounts service writes the audit entry.',
  },
  async ({ actor, body }) => {
    if (!actor) throw new ForbiddenError();
    return { status: 201, data: await saveAccount(actor, body) };
  },
);
