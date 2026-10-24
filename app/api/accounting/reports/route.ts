// path: app/api/accounting/reports/route.ts
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { REPORT_CATALOG } from '@/config/s15-accounting';

export const GET = withApi(
  {
    id: 'accounting.reports.catalog',
    scope: 'tenant',
    permission: { action: 'accounting.read', resourceType: 'report' },
  },
  async ({ actor }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: REPORT_CATALOG };
  },
);
