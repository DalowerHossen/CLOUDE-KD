// path: app/api/expenses/reports/[report]/export/route.ts
// Plain handler: an expense report as a CSV, Excel or PDF file.
import { z } from 'zod';
import { getService } from '@/lib/container';
import {
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
  errorResponse,
  normalizeError,
} from '@/lib/errors';
import { resolveCorrelationId } from '@/lib/logger/correlation';
import { dayText } from '@/services/accounting/journal-rules';
import { EXPENSE_REPORT_KEYS, exportExpenseReport } from '@/services/expense/reports';
import { assertApiModuleEnabled } from '@/services/company/module-access';

export const runtime = 'nodejs';

const query = z.strictObject({
  format: z.enum(['csv', 'xlsx', 'pdf']).default('csv'),
  from: dayText,
  to: dayText,
});

export async function GET(
  request: Request,
  context: { params: Promise<{ report: string }> },
): Promise<Response> {
  const correlationId = resolveCorrelationId(request.headers.get('x-correlation-id'));
  try {
    const { report } = await context.params;
    const key = z.enum(EXPENSE_REPORT_KEYS).safeParse(report);
    if (!key.success) throw new NotFoundError();
    const actor = await getService('auth').getActor();
    if (!actor) throw new UnauthorizedError();
    await assertApiModuleEnabled(new URL(request.url).pathname, actor.companyId);
    if (!actor.companyId) throw new NotFoundError();
    if (!(await getService('permissions').can(actor, 'expense.read', { type: 'expense' })))
      throw new ForbiddenError();
    const parsed = query.safeParse(Object.fromEntries(new URL(request.url).searchParams));
    if (!parsed.success) throw new ValidationError('Check the report options.');
    const file = await exportExpenseReport(
      actor,
      key.data,
      parsed.data.from,
      parsed.data.to,
      parsed.data.format,
    );
    await getService('audit').record({
      action: 'expense.report_exported',
      resourceType: 'expense',
      resourceId: null,
      companyId: actor.companyId,
      metadata: {
        report: key.data,
        format: parsed.data.format,
        exportId: file.exportId,
        by: actor.userId,
      },
    });
    return new Response(Buffer.from(file.bytes), {
      headers: {
        'content-type': file.mimeType,
        'content-length': String(file.bytes.length),
        'content-disposition': `attachment; filename="${file.fileName.replace(/[^A-Za-z0-9._-]/g, '_')}"`,
        'cache-control': 'private, no-store',
        'x-content-type-options': 'nosniff',
        'content-security-policy': "default-src 'none'; sandbox",
      },
    });
  } catch (thrown) {
    return errorResponse(normalizeError(thrown), correlationId);
  }
}
