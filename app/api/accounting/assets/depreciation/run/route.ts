// path: app/api/accounting/assets/depreciation/run/route.ts
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { runInput } from '@/services/asset/depreciation-rules';
import { runDepreciationFor } from '@/services/asset/depreciation';

export const POST = withApi(
  {
    id: 'accounting.assets.depreciation.run',
    scope: 'tenant',
    permission: { action: 'accounting.asset.manage', resourceType: 'fixed_asset' },
    body: runInput,
    idempotent: true,
    auditExempt: 'The depreciation service writes the audit entry.',
  },
  async ({ actor, body }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await runDepreciationFor(actor, body) };
  },
);
