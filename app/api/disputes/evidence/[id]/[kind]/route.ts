// path: app/api/disputes/evidence/[id]/[kind]/route.ts
// The stored PDF or ZIP of an evidence pack. A plain handler because the answer is the file; it reads only a pack of the
// session's own company and checks the stored file against its checksum first.
import { getService } from '@/lib/container';
import {
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
  errorResponse,
  normalizeError,
} from '@/lib/errors';
import { resolveCorrelationId } from '@/lib/logger/correlation';
import { readPackFile } from '@/services/evidence/packs';

export const runtime = 'nodejs';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string; kind: string }> },
): Promise<Response> {
  const correlationId = resolveCorrelationId(request.headers.get('x-correlation-id'));
  try {
    const { id, kind } = await context.params;
    if (!UUID.test(id) || (kind !== 'pdf' && kind !== 'zip')) throw new NotFoundError();
    const actor = await getService('auth').getActor();
    if (!actor) throw new UnauthorizedError();
    if (!actor.companyId) throw new NotFoundError();
    if (!(await getService('permissions').can(actor, 'dispute.read', { type: 'dispute' })))
      throw new ForbiddenError();
    const file = await readPackFile(actor.companyId, id, kind);
    return new Response(Buffer.from(file.bytes), {
      headers: {
        'content-type': file.mimeType,
        'content-length': String(file.bytes.length),
        'content-disposition': `attachment; filename="${file.name}"`,
        'cache-control': 'private, no-store',
        'x-content-type-options': 'nosniff',
        'content-security-policy': "default-src 'none'; sandbox",
      },
    });
  } catch (thrown) {
    return errorResponse(normalizeError(thrown), correlationId);
  }
}
