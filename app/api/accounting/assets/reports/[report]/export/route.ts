// path: app/api/accounting/assets/reports/[report]/export/route.ts
// Plain handler: an asset report as a CSV, Excel or PDF file.
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
import { ASSET_REPORT_KEYS, exportAssetReport } from '@/services/asset/reports';
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
    const key = z.enum(ASSET_REPORT_KEYS).safeParse(report);
    if (!key.success) throw new NotFoundError();
    const actor = await getService('auth').getActor();
    if (!actor) throw new UnauthorizedError();
    await assertApiModuleEnabled(new URL(request.url).pathname, actor.companyId);
    if (!actor.companyId) throw new NotFoundError();
    if (!(await getService('permissions').can(actor, 'accounting.read', { type: 'fixed_asset' })))
      throw new ForbiddenError();
    const parsed = query.safeParse(Object.fromEntries(new URL(request.url).searchParams));
    if (!parsed.success) throw new ValidationError('Check the report options.');
    const file = await exportAssetReport(
      actor,
      key.data,
      parsed.data.from,
      parsed.data.to,
      parsed.data.format,
    );
    await getService('audit').record({
      action: 'asset.report_exported',
      resourceType: 'fixed_asset',
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
