// path: app/api/analytics/pixels/route.ts
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { pixelSettingsSchema } from '@/lib/analytics/providers';
import { readPixels, savePixels } from '@/services/analytics/pixels';

export const GET = withApi(
  {
    id: 'analytics.pixels.get',
    scope: 'platform',
    networkContext: 'admin',
    permission: { action: 'analytics.read', resourceType: 'analytics' },
  },
  async () => ({ data: await readPixels() }),
);

export const POST = withApi(
  {
    id: 'analytics.pixels.save',
    scope: 'platform',
    networkContext: 'admin',
    permission: { action: 'analytics.edit', resourceType: 'analytics' },
    stepUp: { maxAgeSeconds: 300 },
    body: pixelSettingsSchema,
    auditExempt: 'The analytics service writes the audit entry.',
  },
  async ({ actor, body }) => {
    if (!actor) throw new ForbiddenError();
    return { data: await savePixels(actor, body) };
  },
);
