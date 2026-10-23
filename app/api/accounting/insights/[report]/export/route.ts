// path: app/api/accounting/insights/[report]/export/route.ts
// Plain handler: a business intelligence table as a CSV, Excel or PDF file.
import { z } from 'zod';
import { NotFoundError, errorResponse, normalizeError } from '@/lib/errors';
import { resolveCorrelationId } from '@/lib/logger/correlation';
import { exportResponse } from '@/services/budget/export-response';
import { BI_REPORT_KEYS, reportTable } from '@/services/budget/report-tables';

export const runtime = 'nodejs';

export async function GET(
  request: Request,
  context: { params: Promise<{ report: string }> },
): Promise<Response> {
  const { report } = await context.params;
  const key = z.enum(BI_REPORT_KEYS).safeParse(report);
  if (!key.success)
    return errorResponse(
      normalizeError(new NotFoundError()),
      resolveCorrelationId(request.headers.get('x-correlation-id')),
    );
  return exportResponse(request, {
    permission: 'accounting.read',
    resourceType: 'insight',
    auditAction: 'insight.report_exported',
    query: z.object({ format: z.string().optional() }).strip(),
    build: (actor) => reportTable(actor, 'bi', { bi: key.data }),
  });
}
