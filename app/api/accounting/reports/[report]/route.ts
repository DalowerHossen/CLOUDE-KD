// path: app/api/accounting/reports/[report]/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { REPORT_KEYS } from '@/config/s15-accounting';
import { ForbiddenError } from '@/lib/errors';
import { dayText } from '@/services/accounting/journal-rules';
import { runReport } from '@/services/accounting/reports';

export const GET = withApi(
  {
    id: 'accounting.reports.run',
    scope: 'tenant',
    permission: { action: 'accounting.read', resourceType: 'report' },
    params: z.object({ report: z.enum(REPORT_KEYS) }).strict(),
    query: z.strictObject({
      from: dayText.optional(),
      to: dayText.optional(),
      asOf: dayText.optional(),
      compareFrom: dayText.optional(),
      compareTo: dayText.optional(),
      accountId: z.string().uuid().optional(),
    }),
  },
  async ({ actor, params, query }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await runReport(actor.companyId, params.report, query) };
  },
);
