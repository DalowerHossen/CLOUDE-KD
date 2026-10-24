// path: app/api/payroll/settings/route.ts
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { settingsInput } from '@/services/payroll/payroll-rules';
import { getPayrollSettings, savePayrollSettings } from '@/services/payroll/structures';

export const GET = withApi(
  {
    id: 'payroll.settings.get',
    scope: 'tenant',
    permission: { action: 'payroll.settings.manage', resourceType: 'payroll_settings' },
  },
  async ({ actor }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await getPayrollSettings(actor.companyId) };
  },
);

export const PUT = withApi(
  {
    id: 'payroll.settings.save',
    scope: 'tenant',
    permission: { action: 'payroll.settings.manage', resourceType: 'payroll_settings' },
    body: settingsInput,
    auditExempt: 'The structure service writes the audit entry.',
  },
  async ({ actor, body }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await savePayrollSettings(actor, body) };
  },
);
