// path: app/api/reports/[key]/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { paramsFromQuery, reportQuerySchema } from '@/lib/reports/params';
import { runReport } from '@/services/report/reports';

export const GET = withApi(
  {
    id: 'reports.run',
    scope: 'tenant',
    permission: { action: 'report.read', resourceType: 'report' },
    params: z.object({ key: z.string().regex(/^[a-z][a-z0-9_]{1,40}$/) }).strict(),
    query: reportQuerySchema,
  },
  async ({ actor, params: p, query }) => {
    if (!actor) throw new ForbiddenError();
    return { data: await runReport(actor, p.key, paramsFromQuery(query)) };
  },
);
