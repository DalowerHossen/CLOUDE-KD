// path: app/api/accounting/assets/reports/[report]/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { dayText } from '@/services/accounting/journal-rules';
import { ASSET_REPORT_KEYS, assetReport } from '@/services/asset/reports';

export const GET = withApi(
  {
    id: 'accounting.assets.reports.run',
    scope: 'tenant',
    permission: { action: 'accounting.read', resourceType: 'fixed_asset' },
    params: z.object({ report: z.enum(ASSET_REPORT_KEYS) }).strict(),
    query: z.strictObject({ from: dayText, to: dayText }),
  },
  async ({ actor, params, query }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await assetReport(actor, params.report, query.from, query.to) };
  },
);
