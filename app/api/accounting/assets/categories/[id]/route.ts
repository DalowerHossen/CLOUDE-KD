// path: app/api/accounting/assets/categories/[id]/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { categoryUpdate } from '@/services/asset/depreciation-rules';
import { updateAssetCategory } from '@/services/asset/categories';

export const PATCH = withApi(
  {
    id: 'accounting.assets.categories.update',
    scope: 'tenant',
    permission: { action: 'accounting.asset.manage', resourceType: 'asset_category' },
    params: z.object({ id: z.string().uuid() }).strict(),
    body: categoryUpdate,
    auditExempt: 'The category service writes the audit entry.',
  },
  async ({ actor, params, body }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await updateAssetCategory(actor, params.id, body) };
  },
);
