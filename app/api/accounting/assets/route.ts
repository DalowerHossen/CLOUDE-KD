// path: app/api/accounting/assets/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { assetInput } from '@/services/asset/depreciation-rules';
import { createAsset, listAssets } from '@/services/asset/assets';

export const GET = withApi(
  {
    id: 'accounting.assets.list',
    scope: 'tenant',
    permission: { action: 'accounting.read', resourceType: 'fixed_asset' },
    query: z.strictObject({
      status: z.enum(['active', 'sold', 'disposed']).optional(),
      categoryId: z.string().uuid().optional(),
      search: z.string().trim().max(80).optional(),
    }),
  },
  async ({ actor, query }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await listAssets(actor.companyId, query) };
  },
);

export const POST = withApi(
  {
    id: 'accounting.assets.create',
    scope: 'tenant',
    permission: { action: 'accounting.asset.manage', resourceType: 'fixed_asset' },
    body: assetInput,
    idempotent: true,
    auditExempt: 'The asset service writes the audit entry.',
  },
  async ({ actor, body }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { status: 201, data: await createAsset(actor, body) };
  },
);
