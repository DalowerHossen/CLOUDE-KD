// path: app/api/reports/route.ts
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { reportCatalog } from '@/services/report/reports';

export const GET = withApi(
  {
    id: 'reports.catalog',
    scope: 'tenant',
    permission: { action: 'report.read', resourceType: 'report' },
  },
  async ({ actor }) => {
    if (!actor) throw new ForbiddenError();
    return {
      data: reportCatalog().map((d) => ({
        key: d.key,
        title: d.title,
        description: d.description,
        category: d.category,
        usesPeriod: d.usesPeriod,
        groupable: d.groupable,
      })),
    };
  },
);
