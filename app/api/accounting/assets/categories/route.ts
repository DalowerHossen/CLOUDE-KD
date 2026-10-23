// path: app/api/accounting/assets/categories/route.ts
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { categoryInput } from '@/services/asset/depreciation-rules';
import { createAssetCategory, listAssetCategories } from '@/services/asset/categories';

export const GET = withApi(
  {
    id: 'accounting.assets.categories.list',
    scope: 'tenant',
    permission: { action: 'accounting.read', resourceType: 'asset_category' },
  },
  async ({ actor }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await listAssetCategories(actor.companyId) };
  },
);

export const POST = withApi(
  {
    id: 'accounting.assets.categories.create',
    scope: 'tenant',
    permission: { action: 'accounting.asset.manage', resourceType: 'asset_category' },
    body: categoryInput,
    auditExempt: 'The category service writes the audit entry.',
  },
  async ({ actor, body }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { status: 201, data: await createAssetCategory(actor, body) };
  },
);
