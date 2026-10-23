// path: app/api/accounting/tax/reports/[report]/export/route.ts
// Plain handler: a tax report or the filing data of a jurisdiction as a CSV, Excel or PDF file.
import { z } from 'zod';
import { NotFoundError, errorResponse, normalizeError } from '@/lib/errors';
import { resolveCorrelationId } from '@/lib/logger/correlation';
import { dayText } from '@/services/accounting/journal-rules';
import { exportResponse } from '@/services/budget/export-response';
import { TAX_REPORT_KEYS, taxReport } from '@/services/taxfiling/reports';

export const runtime = 'nodejs';

export async function GET(
  request: Request,
  context: { params: Promise<{ report: string }> },
): Promise<Response> {
  const { report } = await context.params;
  const key = z.enum(TAX_REPORT_KEYS).safeParse(report);
  if (!key.success)
    return errorResponse(
      normalizeError(new NotFoundError()),
      resolveCorrelationId(request.headers.get('x-correlation-id')),
    );
  return exportResponse(request, {
    permission: 'accounting.read',
    resourceType: 'tax_filing',
    auditAction: 'tax.report_exported',
    query: z
      .object({
        format: z.string().optional(),
        from: dayText,
        to: dayText,
        jurisdiction: z.string().trim().max(60).optional(),
      })
      .strip(),
    build: (actor, q) =>
      taxReport(actor, key.data, q.from as string, q.to as string, q.jurisdiction ?? null),
  });
}
