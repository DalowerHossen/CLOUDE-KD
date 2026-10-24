// path: app/api/time/settings/route.ts
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { timeSettingsSchema } from '@/lib/project/input';
import { getTimeSettings, saveTimeSettings } from '@/services/project/time';

export const GET = withApi(
  {
    id: 'time.settings',
    scope: 'tenant',
    permission: { action: 'time.log', resourceType: 'time_settings' },
  },
  async ({ actor }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await getTimeSettings(actor.companyId) };
  },
);

export const PUT = withApi(
  {
    id: 'time.saveSettings',
    scope: 'tenant',
    permission: { action: 'time.settings', resourceType: 'time_settings' },
    body: timeSettingsSchema,
    auditExempt: 'The time service writes the audit entry.',
  },
  async ({ actor, body }) => {
    if (!actor) throw new ForbiddenError();
    return { data: await saveTimeSettings(actor, body) };
  },
);
