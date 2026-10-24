// path: app/api/integrations/ocr/settings/route.ts
import { withApi } from '@/lib/api/with-api';
import { OCR_STEP_UP_SECONDS } from '@/config/s16-ocr';
import { ForbiddenError } from '@/lib/errors';
import { settingsInput } from '@/lib/ocr/rules';
import { getSettings, saveSettings } from '@/services/ocr/settings';

/** The settings. The API key is never returned, only whether there is one and its last four characters. */
export const GET = withApi(
  {
    id: 'ocr.settings.get',
    scope: 'tenant',
    permission: { action: 'integrations.ocr.read', resourceType: 'ocr_settings' },
  },
  async ({ actor }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await getSettings(actor.companyId) };
  },
);

/** Switches OCR on or off and sets the key. Needs a fresh identity check. */
export const PUT = withApi(
  {
    id: 'ocr.settings.save',
    scope: 'tenant',
    permission: { action: 'integrations.ocr.manage', resourceType: 'ocr_settings' },
    body: settingsInput,
    stepUp: { maxAgeSeconds: OCR_STEP_UP_SECONDS },
    auditExempt: 'The OCR settings service writes the audit entry.',
  },
  async ({ actor, body }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await saveSettings(actor, body) };
  },
);
