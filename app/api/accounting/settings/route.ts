// path: app/api/accounting/settings/route.ts
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { settingsInput } from '@/services/accounting/period-rules';
import { getSettings, saveSettings } from '@/services/accounting/periods';

export const GET = withApi(
  {
    id: 'accounting.settings.get',
    scope: 'tenant',
    permission: { action: 'accounting.read', resourceType: 'accounting_settings' },
  },
  async ({ actor }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await getSettings(actor.companyId) };
  },
);

export const PUT = withApi(
  {
    id: 'accounting.settings.save',
    scope: 'tenant',
    permission: { action: 'accounting.period.manage', resourceType: 'accounting_settings' },
    body: settingsInput,
    auditExempt: 'The period service writes the audit entry.',
  },
  async ({ actor, body }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await saveSettings(actor, body) };
  },
);
