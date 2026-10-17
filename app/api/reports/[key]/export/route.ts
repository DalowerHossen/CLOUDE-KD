// path: app/api/reports/[key]/export/route.ts
// A plain handler: the answer is a file (CSV, Excel or PDF). Only for a person who may export reports of their company.
import { getService } from '@/lib/container';
import {
  NotFoundError,
  UnauthorizedError,
  ValidationError,
  errorResponse,
  normalizeError,
} from '@/lib/errors';
import { resolveCorrelationId } from '@/lib/logger/correlation';
import { paramsFromQuery, reportQuerySchema } from '@/lib/reports/params';
import { exportReport } from '@/services/report/export';

export const runtime = 'nodejs';
const KEY = /^[a-z][a-z0-9_]{1,40}$/;

export async function GET(
  request: Request,
  context: { params: Promise<{ key: string }> },
): Promise<Response> {
  const correlationId = resolveCorrelationId(request.headers.get('x-correlation-id'));
  try {
    const { key } = await context.params;
    if (!KEY.test(key)) throw new NotFoundError();
    const actor = await getService('auth').getActor();
    if (!actor) throw new UnauthorizedError();
    if (!actor.companyId) throw new NotFoundError();
    const query = reportQuerySchema.safeParse(
      Object.fromEntries(new URL(request.url).searchParams),
    );
    if (!query.success) throw new ValidationError('Check the report options.');
    const file = await exportReport(
      actor,
      key,
      paramsFromQuery(query.data),
      query.data.format ?? 'csv',
    );
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
