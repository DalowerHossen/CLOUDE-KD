// path: app/api/portal/branding/route.ts
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import {
  exportBranding,
  getBrandingView,
  saveBranding,
  saveBodySchema,
} from '@/services/branding/save';

const PERMISSION = { action: 'company.manage', resourceType: 'company' } as const;

/** The brand as the company has it now, and the same data in the form of the export file. */
export const GET = withApi(
  { id: 'portal.branding.get', scope: 'tenant', permission: PERMISSION },
  async ({ actor }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    const [view, file] = await Promise.all([
      getBrandingView(actor.companyId),
      exportBranding(actor.companyId),
    ]);
    return { data: { ...view, file } };
  },
);

export const PUT = withApi(
  {
    id: 'portal.branding.save',
    scope: 'tenant',
    permission: PERMISSION,
    body: saveBodySchema,
    auditExempt: 'The settings service and the branding history record the change.',
  },
  async ({ actor, body }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await saveBranding(actor, body.brand, body.expectedVersion) };
  },
);
