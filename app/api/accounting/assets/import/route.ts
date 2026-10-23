// path: app/api/accounting/assets/import/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { MAX_IMPORT_BYTES } from '@/config/s15-accounting';
import { importAssets } from '@/services/asset/assets';

export const POST = withApi(
  {
    id: 'accounting.assets.import',
    scope: 'tenant',
    permission: { action: 'accounting.asset.manage', resourceType: 'fixed_asset' },
    body: z.strictObject({ csv: z.string().min(1).max(MAX_IMPORT_BYTES) }),
    maxBodyBytes: MAX_IMPORT_BYTES + 4096,
    auditExempt: 'The asset service writes the audit entry.',
  },
  async ({ actor, body }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await importAssets(actor, body.csv) };
  },
);
