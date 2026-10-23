// path: app/api/accounting/tax/reports/[report]/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { dayText } from '@/services/accounting/journal-rules';
import { TAX_REPORT_KEYS, taxReport } from '@/services/taxfiling/reports';

export const GET = withApi(
  {
    id: 'accounting.tax.reports',
    scope: 'tenant',
    permission: { action: 'accounting.read', resourceType: 'tax_filing' },
    params: z.object({ report: z.enum(TAX_REPORT_KEYS) }).strict(),
    query: z.strictObject({
      from: dayText,
      to: dayText,
      jurisdiction: z.string().trim().max(60).optional(),
    }),
  },
  async ({ actor, params, query }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return {
      data: await taxReport(actor, params.report, query.from, query.to, query.jurisdiction ?? null),
    };
  },
);
