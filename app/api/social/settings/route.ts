// path: app/api/social/settings/route.ts
import { withApi } from '@/lib/api/with-api';
import { SOCIAL_STEP_UP_SECONDS } from '@/config/s16-social';
import { ForbiddenError } from '@/lib/errors';
import { settingsInput } from '@/lib/social/schedule';
import { getSettings, saveSettings } from '@/services/social/settings';

export const GET = withApi(
  {
    id: 'social.settings.get',
    scope: 'tenant',
    permission: { action: 'social.read', resourceType: 'social_settings' },
  },
  async ({ actor }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await getSettings(actor.companyId) };
  },
);

/** Turns approval of posts and link tracking on or off. Needs a fresh identity check. */
export const PUT = withApi(
  {
    id: 'social.settings.save',
    scope: 'tenant',
    permission: { action: 'social.approve', resourceType: 'social_settings' },
    body: settingsInput,
    stepUp: { maxAgeSeconds: SOCIAL_STEP_UP_SECONDS },
    auditExempt: 'The settings service writes the audit entry.',
  },
  async ({ actor, body }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await saveSettings(actor, body) };
  },
);
