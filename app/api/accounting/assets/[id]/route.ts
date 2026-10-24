// path: app/api/accounting/assets/[id]/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { assetUpdate } from '@/services/asset/depreciation-rules';
import { getAsset, updateAsset } from '@/services/asset/assets';

const params = z.object({ id: z.string().uuid() }).strict();

export const GET = withApi(
  {
    id: 'accounting.assets.get',
    scope: 'tenant',
    permission: { action: 'accounting.read', resourceType: 'fixed_asset' },
    params,
  },
  async ({ actor, params: p }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await getAsset(actor.companyId, p.id) };
  },
);

export const PATCH = withApi(
  {
    id: 'accounting.assets.update',
    scope: 'tenant',
    permission: { action: 'accounting.asset.manage', resourceType: 'fixed_asset' },
    params,
    body: assetUpdate,
    auditExempt: 'The asset service writes the audit entry.',
  },
  async ({ actor, params: p, body }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await updateAsset(actor, p.id, body) };
  },
);
