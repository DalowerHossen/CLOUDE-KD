// path: app/api/invoices/tax/exemptions/[clientId]/certificate/file/route.ts
// A plain handler: the answer is the certificate file. It reads only the certificate of a client of the signed-in
// company, and only for a person who may see tax data.
import { getService } from '@/lib/container';
import {
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
  errorResponse,
  normalizeError,
} from '@/lib/errors';
import { resolveCorrelationId } from '@/lib/logger/correlation';
import { readCertificate } from '@/services/tax/exemptions';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
  request: Request,
  context: { params: Promise<{ clientId: string }> },
): Promise<Response> {
  const correlationId = resolveCorrelationId(request.headers.get('x-correlation-id'));
  try {
    const { clientId } = await context.params;
    if (!UUID.test(clientId)) throw new NotFoundError();
    const actor = await getService('auth').getActor();
    if (!actor) throw new UnauthorizedError();
    if (!actor.companyId) throw new NotFoundError();
    if (!(await getService('permissions').can(actor, 'tax.read', { type: 'client' })))
      throw new ForbiddenError();
    const file = await readCertificate(actor.companyId, clientId);
    return new Response(Buffer.from(file.bytes), {
      headers: {
        'content-type': file.mimeType,
        'content-length': String(file.bytes.length),
        'content-disposition': 'attachment; filename="tax-certificate"',
        'cache-control': 'private, no-store',
        'x-content-type-options': 'nosniff',
        'content-security-policy': "default-src 'none'; sandbox",
      },
    });
  } catch (thrown) {
    return errorResponse(normalizeError(thrown), correlationId);
  }
}
