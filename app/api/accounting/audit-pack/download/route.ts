// path: app/api/accounting/audit-pack/download/route.ts
// Plain handler: makes the audit pack of a period and sends it as a gzip file. Needs the owner's permission and a fresh identity
// check; making a pack is written to the audit log and recorded with its checksums.
import {
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
  errorResponse,
  normalizeError,
} from '@/lib/errors';
import { getService } from '@/lib/container';
import { resolveCorrelationId } from '@/lib/logger/correlation';
import { buildAuditPack } from '@/services/accounting/audit-pack';

export const runtime = 'nodejs';

export async function GET(request: Request): Promise<Response> {
  const correlationId = resolveCorrelationId(request.headers.get('x-correlation-id'));
  try {
    const actor = await getService('auth').getActor();
    if (!actor) throw new UnauthorizedError();
    if (!actor.companyId) throw new NotFoundError();
    if (
      !(await getService('permissions').can(actor, 'accounting.audit.export', {
        type: 'audit_pack',
      }))
    )
      throw new ForbiddenError();
    await getService('auth').requireStepUp(actor, { maxAgeSeconds: 600 });
    const params = new URL(request.url).searchParams;
    const from = params.get('from');
    const to = params.get('to');
    if (!from || !to) throw new ValidationError('Choose a period.');
    const pack = await buildAuditPack(actor, { from, to });
    return new Response(Buffer.from(pack.bytes), {
      headers: {
        'content-type': 'application/gzip',
        'content-length': String(pack.bytes.length),
        'content-disposition': `attachment; filename="${pack.fileName.replace(/[^A-Za-z0-9._-]/g, '_')}"`,
        'x-pack-manifest-sha256': pack.manifestSha256,
        'x-pack-file-sha256': pack.fileSha256,
        'cache-control': 'private, no-store',
        'x-content-type-options': 'nosniff',
        'content-security-policy': "default-src 'none'; sandbox",
      },
    });
  } catch (thrown) {
    return errorResponse(normalizeError(thrown), correlationId);
  }
}
