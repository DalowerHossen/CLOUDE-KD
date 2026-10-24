// path: app/api/invoices/tax/rates/route.ts
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { taxRateInput } from '@/lib/tax/input';
import { createRate, listRates } from '@/services/tax/rates';

export const GET = withApi(
  {
    id: 'tax.rates.list',
    scope: 'tenant',
    permission: { action: 'tax.read', resourceType: 'tax_rate' },
  },
  async ({ actor }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await listRates(actor.companyId) };
  },
);

export const POST = withApi(
  {
    id: 'tax.rates.create',
    scope: 'tenant',
    permission: { action: 'tax.manage', resourceType: 'tax_rate' },
    body: taxRateInput,
    auditExempt: 'The tax service writes the audit entry.',
  },
  async ({ actor, body }) => {
    if (!actor) throw new ForbiddenError();
    return { status: 201, data: await createRate(actor, body) };
  },
);
