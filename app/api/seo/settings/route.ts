// path: app/api/seo/settings/route.ts
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { seoSettingsSchema } from '@/lib/seo/settings';
import { readSeoSettings, saveSeoSettings } from '@/services/seo/settings';

export const GET = withApi(
  {
    id: 'seo.settings.get',
    scope: 'platform',
    networkContext: 'admin',
    permission: { action: 'seo.read', resourceType: 'seo' },
  },
  async () => ({ data: await readSeoSettings() }),
);

export const POST = withApi(
  {
    id: 'seo.settings.save',
    scope: 'platform',
    networkContext: 'admin',
    permission: { action: 'seo.edit', resourceType: 'seo' },
    stepUp: { maxAgeSeconds: 300 },
    body: seoSettingsSchema,
    auditExempt: 'The SEO service writes the audit entry.',
  },
  async ({ actor, body }) => {
    if (!actor) throw new ForbiddenError();
    return { data: await saveSeoSettings(actor, body) };
  },
);
