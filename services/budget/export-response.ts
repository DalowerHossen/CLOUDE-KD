// path: services/budget/export-response.ts
// The plain handler behind every download of 15.7.b (budget variance, forecasts, business intelligence, consolidated statements):
// it checks the person and the permission, builds the table, writes the audit entry and answers with the file.
import 'server-only';
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
import type { ReportResult } from '@/lib/reports/types';
import type { Actor } from '@/types/contracts';
import { buildReportFile, type ExportFormat } from '@/services/report/export';
import { assertApiModuleEnabled } from '@/services/company/module-access';

const FORMATS = z.enum(['csv', 'xlsx', 'pdf']);

export interface ExportSpec {
  permission: string;
  resourceType: string;
  auditAction: string;
  /** The query parameters the route accepts besides `format`. */
  query: z.ZodTypeAny;
  build: (actor: Actor, query: Record<string, string>) => Promise<ReportResult>;
}

export async function exportResponse(request: Request, spec: ExportSpec): Promise<Response> {
  const correlationId = resolveCorrelationId(request.headers.get('x-correlation-id'));
  try {
    const actor = await getService('auth').getActor();
    if (!actor) throw new UnauthorizedError();
    await assertApiModuleEnabled(new URL(request.url).pathname, actor.companyId);
    if (!actor.companyId) throw new NotFoundError();
    if (!(await getService('permissions').can(actor, spec.permission, { type: spec.resourceType })))
      throw new ForbiddenError();
    const raw = Object.fromEntries(new URL(request.url).searchParams);
    const format = FORMATS.safeParse(raw.format ?? 'csv');
    const query = spec.query.safeParse(raw);
    if (!format.success || !query.success) throw new ValidationError('Check the report options.');
    const table = await spec.build(actor, query.data as Record<string, string>);
    const file = await buildReportFile(
      actor.companyId,
      table,
      format.data as ExportFormat,
      actor.email || actor.userId,
    );
    await getService('audit').record({
      action: spec.auditAction,
      resourceType: spec.resourceType,
      resourceId: null,
      companyId: actor.companyId,
      metadata: {
        report: table.key,
        format: format.data,
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
