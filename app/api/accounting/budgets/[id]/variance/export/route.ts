// path: app/api/accounting/budgets/[id]/variance/export/route.ts
// Plain handler: the budget against actual report as a CSV, Excel or PDF file.
import { z } from 'zod';
import { NotFoundError, errorResponse, normalizeError } from '@/lib/errors';
import { resolveCorrelationId } from '@/lib/logger/correlation';
import { dayText } from '@/services/accounting/journal-rules';
import { exportResponse } from '@/services/budget/export-response';
import { reportTable } from '@/services/budget/report-tables';

export const runtime = 'nodejs';

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await context.params;
  if (!z.string().uuid().safeParse(id).success)
    return errorResponse(
      normalizeError(new NotFoundError()),
      resolveCorrelationId(request.headers.get('x-correlation-id')),
    );
  return exportResponse(request, {
    permission: 'accounting.read',
    resourceType: 'budget',
    auditAction: 'budget.report_exported',
    query: z.object({ format: z.string().optional(), through: dayText.optional() }).strip(),
    build: (actor, q) =>
      reportTable(actor, 'variance', {
        budgetId: id,
        ...(q.through ? { through: q.through } : {}),
      }),
  });
}
