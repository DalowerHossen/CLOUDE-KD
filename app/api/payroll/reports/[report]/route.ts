// path: app/api/payroll/reports/[report]/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { dayText } from '@/services/accounting/journal-rules';
import { PAYROLL_REPORT_KEYS, payrollReport } from '@/services/payroll/reports';

export const GET = withApi(
  {
    id: 'payroll.reports.run',
    scope: 'tenant',
    permission: { action: 'payroll.report.read', resourceType: 'pay_run' },
    params: z.object({ report: z.enum(PAYROLL_REPORT_KEYS) }).strict(),
    query: z.strictObject({ from: dayText, to: dayText }),
  },
  async ({ actor, params, query }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await payrollReport(actor, params.report, query.from, query.to) };
  },
);
