// path: app/api/accounting/assets/[id]/dispose/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { disposeInput } from '@/services/asset/depreciation-rules';
import { disposeAsset } from '@/services/asset/disposal';

export const POST = withApi(
  {
    id: 'accounting.assets.dispose',
    scope: 'tenant',
    permission: { action: 'accounting.asset.manage', resourceType: 'fixed_asset' },
    params: z.object({ id: z.string().uuid() }).strict(),
    body: disposeInput,
    idempotent: true,
    stepUp: { maxAgeSeconds: 600 },
    auditExempt: 'The asset service writes the audit entry.',
  },
  async ({ actor, params, body }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await disposeAsset(actor, params.id, body) };
  },
);
