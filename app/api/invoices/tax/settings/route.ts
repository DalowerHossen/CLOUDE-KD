// path: app/api/invoices/tax/settings/route.ts
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { taxSettingsSave } from '@/lib/tax/input';
import { getTaxSettings, saveTaxSettings } from '@/services/tax/settings';

export const GET = withApi(
  {
    id: 'tax.settings.get',
    scope: 'tenant',
    permission: { action: 'tax.read', resourceType: 'tax_settings' },
  },
  async ({ actor }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await getTaxSettings(actor.companyId) };
  },
);

export const PUT = withApi(
  {
    id: 'tax.settings.save',
    scope: 'tenant',
    permission: { action: 'tax.manage', resourceType: 'tax_settings' },
    body: taxSettingsSave,
    auditExempt: 'The tax service writes the audit entry.',
  },
  async ({ actor, body }) => {
    if (!actor) throw new ForbiddenError();
    return { data: await saveTaxSettings(actor, body.expectedVersion, body.settings) };
  },
);
