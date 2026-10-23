// path: app/api/integrations/messaging/settings/route.ts
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { settingsInput } from '@/lib/messaging/rules';
import { getSettings } from '@/services/messaging/db';
import { saveSettings } from '@/services/messaging/preferences';

export const GET = withApi(
  {
    id: 'messaging.settings.get',
    scope: 'tenant',
    permission: { action: 'integrations.messaging.read', resourceType: 'messaging_settings' },
  },
  async ({ actor }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await getSettings(actor.companyId) };
  },
);

export const PUT = withApi(
  {
    id: 'messaging.settings.save',
    scope: 'tenant',
    permission: { action: 'integrations.messaging.manage', resourceType: 'messaging_settings' },
    body: settingsInput,
    auditExempt: 'The messaging service writes the audit entry.',
  },
  async ({ actor, body }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await saveSettings(actor, body) };
  },
);
