// path: app/api/portal/branding/import/route.ts
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { importBodySchema, importBranding } from '@/services/branding/save';

export const POST = withApi(
  {
    id: 'portal.branding.import',
    scope: 'tenant',
    permission: { action: 'company.manage', resourceType: 'company' },
    body: importBodySchema,
    maxBodyBytes: 20_000,
    auditExempt: 'The settings service and the branding history record the change.',
  },
  async ({ actor, body }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await importBranding(actor, body.file, body.expectedVersion) };
  },
);
