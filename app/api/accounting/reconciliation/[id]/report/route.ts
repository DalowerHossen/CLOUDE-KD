// path: app/api/accounting/reconciliation/[id]/report/route.ts
// Plain handler: the report of a reconciliation as a CSV, Excel or PDF file.
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
import { reconciliationReport } from '@/services/reconciliation/reconcile';
import { buildReportFile } from '@/services/report/export';

export const runtime = 'nodejs';

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const correlationId = resolveCorrelationId(request.headers.get('x-correlation-id'));
  try {
    const { id } = await context.params;
    if (!z.string().uuid().safeParse(id).success) throw new NotFoundError();
    const actor = await getService('auth').getActor();
    if (!actor) throw new UnauthorizedError();
    if (!actor.companyId) throw new NotFoundError();
    if (!(await getService('permissions').can(actor, 'accounting.read', { type: 'bank_account' })))
      throw new ForbiddenError();
    const format = z
      .enum(['csv', 'xlsx', 'pdf'])
      .safeParse(new URL(request.url).searchParams.get('format') ?? 'csv');
    if (!format.success) throw new ValidationError('Choose csv, xlsx or pdf.');
    const file = await buildReportFile(
      actor.companyId,
      await reconciliationReport(actor.companyId, id),
      format.data,
      actor.email || actor.userId,
    );
    await getService('audit').record({
      action: 'bank.report_exported',
      resourceType: 'reconciliation',
      resourceId: id,
      companyId: actor.companyId,
      metadata: { format: format.data, exportId: file.exportId, by: actor.userId },
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
