// path: app/api/accounting/accounts/export/route.ts
// A plain handler: the chart of accounts as a CSV file.
import { getService } from '@/lib/container';
import {
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
  errorResponse,
  normalizeError,
} from '@/lib/errors';
import { resolveCorrelationId } from '@/lib/logger/correlation';
import { exportAccountsCsv } from '@/services/accounting/accounts';

export const runtime = 'nodejs';

export async function GET(request: Request): Promise<Response> {
  const correlationId = resolveCorrelationId(request.headers.get('x-correlation-id'));
  try {
    const actor = await getService('auth').getActor();
    if (!actor) throw new UnauthorizedError();
    if (!actor.companyId) throw new NotFoundError();
    if (!(await getService('permissions').can(actor, 'accounting.read', { type: 'account' })))
      throw new ForbiddenError();
    const csv = await exportAccountsCsv(actor.companyId);
    await getService('audit').record({
      action: 'accounting.chart_exported',
      resourceType: 'account',
      resourceId: null,
      companyId: actor.companyId,
      metadata: { by: actor.userId },
    });
    return new Response(String.fromCharCode(0xfeff) + csv, {
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': 'attachment; filename="chart-of-accounts.csv"',
        'cache-control': 'private, no-store',
        'x-content-type-options': 'nosniff',
        'content-security-policy': "default-src 'none'; sandbox",
      },
    });
  } catch (thrown) {
    return errorResponse(normalizeError(thrown), correlationId);
  }
}
