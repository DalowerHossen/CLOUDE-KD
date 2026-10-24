// path: app/api/accounting/tax/settings/route.ts
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { getFilingSettings, saveFilingSettings } from '@/services/taxfiling/filing';
import { filingSettingsInput } from '@/services/taxfiling/tax-rules';

export const GET = withApi(
  {
    id: 'accounting.tax.settings',
    scope: 'tenant',
    permission: { action: 'accounting.read', resourceType: 'tax_filing' },
  },
  async ({ actor }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await getFilingSettings(actor.companyId) };
  },
);

export const PUT = withApi(
  {
    id: 'accounting.tax.settings_save',
    scope: 'tenant',
    permission: { action: 'accounting.tax.manage', resourceType: 'tax_filing' },
    body: filingSettingsInput,
    auditExempt: 'The tax service writes the audit entry.',
  },
  async ({ actor, body }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await saveFilingSettings(actor, body) };
  },
);
