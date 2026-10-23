// path: app/api/kyc/review/documents/[id]/route.ts
// Opens one KYC document for a reviewer. A plain handler because the answer is the file itself. The view is logged
// before any byte is read, only people with kyc.review and kyc.file.read get it, and the answer is never cached.
import { getService } from '@/lib/container';
import {
  ForbiddenError,
  NotFoundError,
  RateLimitError,
  UnauthorizedError,
  errorResponse,
  normalizeError,
} from '@/lib/errors';
import { resolveCorrelationId } from '@/lib/logger/correlation';
import { PLATFORM_ROLES } from '@/types/contracts';
import { openDocument } from '@/services/kyc/review';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const correlationId = resolveCorrelationId(request.headers.get('x-correlation-id'));
  try {
    const actor = await getService('auth').getActor();
    if (!actor) throw new UnauthorizedError();
    if (!PLATFORM_ROLES.includes(actor.role)) throw new NotFoundError();
    const permissions = getService('permissions');
    if (
      !(await permissions.can(actor, 'kyc.review', { type: 'kyc' })) ||
      !(await permissions.can(actor, 'kyc.file.read', { type: 'kyc' }))
    )
      throw new ForbiddenError();
    const limit = await getService('security').rateLimit(`kyc-doc:${actor.userId}`, 'api-default');
    if (!limit.allowed) throw new RateLimitError(60);
    const { id } = await context.params;
    if (!UUID.test(id)) throw new NotFoundError();
    const file = await openDocument(actor, id);
    return new Response(Buffer.from(file.bytes), {
      headers: {
        'content-type': file.mimeType,
        'content-length': String(file.bytes.length),
        'content-disposition': 'inline',
        'cache-control': 'no-store',
        'x-content-type-options': 'nosniff',
        'content-security-policy': "default-src 'none'; img-src 'self' data:; sandbox",
      },
    });
  } catch (thrown) {
    return errorResponse(normalizeError(thrown), correlationId);
  }
}
