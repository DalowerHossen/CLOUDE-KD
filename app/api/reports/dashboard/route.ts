// path: app/api/reports/dashboard/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { RANGE_KEYS } from '@/lib/reports/ranges';
import { getDashboard } from '@/services/report/dashboard';

export const GET = withApi(
  {
    id: 'reports.dashboard',
    scope: 'tenant',
    permission: { action: 'invoice.read', resourceType: 'invoice' },
    query: z.object({ range: z.enum(RANGE_KEYS).optional() }).strict(),
  },
  async ({ actor, query }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return {
      data: await getDashboard(
        actor.companyId,
        query.range ?? 'month',
        new Date().toISOString().slice(0, 10),
      ),
    };
  },
);
