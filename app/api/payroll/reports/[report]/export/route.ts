// path: app/api/payroll/reports/[report]/export/route.ts
// Plain handler: a payroll report (also the payroll data for an external accountant) as a CSV, Excel or PDF file.
import { z } from 'zod';
import { NotFoundError, errorResponse, normalizeError } from '@/lib/errors';
import { resolveCorrelationId } from '@/lib/logger/correlation';
import { dayText } from '@/services/accounting/journal-rules';
import { exportResponse } from '@/services/budget/export-response';
import { PAYROLL_REPORT_KEYS, payrollReport } from '@/services/payroll/reports';

export const runtime = 'nodejs';

export async function GET(
  request: Request,
  context: { params: Promise<{ report: string }> },
): Promise<Response> {
  const { report } = await context.params;
  const key = z.enum(PAYROLL_REPORT_KEYS).safeParse(report);
  if (!key.success)
    return errorResponse(
      normalizeError(new NotFoundError()),
      resolveCorrelationId(request.headers.get('x-correlation-id')),
    );
  return exportResponse(request, {
    permission: 'payroll.report.read',
    resourceType: 'pay_run',
    auditAction: 'payroll.report_exported',
    query: z.object({ format: z.string().optional(), from: dayText, to: dayText }).strip(),
    build: (actor, q) => payrollReport(actor, key.data, q.from as string, q.to as string),
  });
}
