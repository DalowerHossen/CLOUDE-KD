// path: app/api/portal/branding/history/route.ts
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { listBrandingHistory } from '@/services/branding/save';

export const GET = withApi(
  {
    id: 'portal.branding.history',
    scope: 'tenant',
    permission: { action: 'company.manage', resourceType: 'company' },
  },
  async ({ actor }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await listBrandingHistory(actor.companyId) };
  },
);
