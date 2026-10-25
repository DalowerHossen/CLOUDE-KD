// path: app/api/accounting/reports/[report]/export/route.ts
// A plain handler: the answer is a file (CSV, Excel or PDF) of an accounting report.
import { z } from 'zod';
import { REPORT_KEYS } from '@/config/s15-accounting';
import { getService } from '@/lib/container';
import {
  NotFoundError,
  UnauthorizedError,
  ValidationError,
  errorResponse,
  normalizeError,
} from '@/lib/errors';
import { resolveCorrelationId } from '@/lib/logger/correlation';
import { dayText } from '@/services/accounting/journal-rules';
import { exportAccountingReport } from '@/services/accounting/report-export';
import { assertApiModuleEnabled } from '@/services/company/module-access';

export const runtime = 'nodejs';

const query = z.strictObject({
  format: z.enum(['csv', 'xlsx', 'pdf']).default('csv'),
  from: dayText.optional(),
  to: dayText.optional(),
  asOf: dayText.optional(),
  compareFrom: dayText.optional(),
  compareTo: dayText.optional(),
  accountId: z.string().uuid().optional(),
});

export async function GET(
  request: Request,
  context: { params: Promise<{ report: string }> },
): Promise<Response> {
  const correlationId = resolveCorrelationId(request.headers.get('x-correlation-id'));
  try {
    const { report } = await context.params;
    const key = z.enum(REPORT_KEYS).safeParse(report);
    if (!key.success) throw new NotFoundError();
    const actor = await getService('auth').getActor();
    if (!actor) throw new UnauthorizedError();
    await assertApiModuleEnabled(new URL(request.url).pathname, actor.companyId);
    if (!actor.companyId) throw new NotFoundError();
    const parsed = query.safeParse(Object.fromEntries(new URL(request.url).searchParams));
    if (!parsed.success) throw new ValidationError('Check the report options.');
    const { format, ...rest } = parsed.data;
    const file = await exportAccountingReport(actor, key.data, rest, format);
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
