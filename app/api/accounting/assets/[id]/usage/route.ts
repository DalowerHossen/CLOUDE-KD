// path: app/api/accounting/assets/[id]/usage/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { usageInput } from '@/services/asset/depreciation-rules';
import { recordUsage } from '@/services/asset/depreciation';

export const POST = withApi(
  {
    id: 'accounting.assets.usage',
    scope: 'tenant',
    permission: { action: 'accounting.asset.manage', resourceType: 'fixed_asset' },
    params: z.object({ id: z.string().uuid() }).strict(),
    body: usageInput,
    auditExempt: 'The asset service writes the audit entry.',
  },
  async ({ actor, params, body }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    await recordUsage(actor, params.id, body);
    return { data: { ok: true } };
  },
);
