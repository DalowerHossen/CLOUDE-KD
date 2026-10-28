// path: app/api/admin/branding/route.ts
import { withApi } from '@/lib/api/with-api';
import { platformBrandSchema } from '@/lib/brand/platform';
import { ForbiddenError } from '@/lib/errors';
import { readPlatformBrand, savePlatformBrand } from '@/services/branding/platform';

export const GET = withApi(
  {
    id: 'admin.branding.get',
    scope: 'platform',
    networkContext: 'admin',
    permission: { action: 'seo.read', resourceType: 'seo' },
  },
  async () => ({ data: await readPlatformBrand() }),
);

export const POST = withApi(
  {
    id: 'admin.branding.save',
    scope: 'platform',
    networkContext: 'admin',
    permission: { action: 'seo.edit', resourceType: 'seo' },
    body: platformBrandSchema,
    auditExempt: 'The branding service writes the audit entry.',
  },
  async ({ actor, body }) => {
    if (!actor) throw new ForbiddenError();
    return { data: await savePlatformBrand(actor, body) };
  },
);
