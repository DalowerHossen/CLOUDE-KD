// path: app/api/invoices/fx/route.ts
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { fxRateInput } from '@/lib/fx/rates';
import { latestRates, saveCompanyRate } from '@/services/fx/rates';

export const GET = withApi(
  {
    id: 'fx.list',
    scope: 'tenant',
    permission: { action: 'tax.read', resourceType: 'fx_rate' },
  },
  async ({ actor }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await latestRates(actor.companyId) };
  },
);

export const PUT = withApi(
  {
    id: 'fx.save',
    scope: 'tenant',
    permission: { action: 'tax.manage', resourceType: 'fx_rate' },
    body: fxRateInput,
    auditExempt: 'The exchange rate service writes the audit entry.',
  },
  async ({ actor, body }) => {
    if (!actor) throw new ForbiddenError();
    await saveCompanyRate(actor, body);
    return { data: { saved: true } };
  },
);
