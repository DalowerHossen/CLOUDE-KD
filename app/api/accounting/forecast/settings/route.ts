// path: app/api/accounting/forecast/settings/route.ts
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { settingsInput } from '@/services/budget/budget-rules';
import { getForecastSettings, saveForecastSettings } from '@/services/budget/forecast';

export const GET = withApi(
  {
    id: 'accounting.forecast.settings',
    scope: 'tenant',
    permission: { action: 'accounting.read', resourceType: 'forecast' },
  },
  async ({ actor }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await getForecastSettings(actor.companyId) };
  },
);

export const PUT = withApi(
  {
    id: 'accounting.forecast.settings_save',
    scope: 'tenant',
    permission: { action: 'accounting.budget.manage', resourceType: 'forecast' },
    body: settingsInput,
    auditExempt: 'The forecast service writes the audit entry.',
  },
  async ({ actor, body }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await saveForecastSettings(actor, body) };
  },
);
