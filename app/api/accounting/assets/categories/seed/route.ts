// path: app/api/accounting/assets/categories/seed/route.ts
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { ensureAssetCategories } from '@/services/asset/categories';

export const POST = withApi(
  {
    id: 'accounting.assets.categories.seed',
    scope: 'tenant',
    permission: { action: 'accounting.asset.manage', resourceType: 'asset_category' },
    auditExempt: 'The category service writes the audit entry.',
  },
  async ({ actor }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: { made: await ensureAssetCategories(actor) } };
  },
);
