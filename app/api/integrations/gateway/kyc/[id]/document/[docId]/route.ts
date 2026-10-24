// path: app/api/integrations/gateway/kyc/[id]/document/[docId]/route.ts
// Opens one document of a sub-merchant's case for the reviewer. A plain handler because the answer is the file itself. The view is
// logged before any byte is read, only people with the review permission of this company get it, and the answer is never cached.
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
import { openKycDocument } from '@/services/gateway/kyc-review';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string; docId: string }> },
): Promise<Response> {
  const correlationId = resolveCorrelationId(request.headers.get('x-correlation-id'));
  try {
    const actor = await getService('auth').getActor();
    if (!actor) throw new UnauthorizedError();
    if (PLATFORM_ROLES.includes(actor.role) || !actor.companyId) throw new NotFoundError();
    if (
      !(await getService('permissions').can(actor, 'gateway.kyc.review', {
        type: 'sub_merchant_kyc',
      }))
    )
      throw new ForbiddenError();
    const limit = await getService('security').rateLimit(
      `smkyc-doc:${actor.userId}`,
      'api-default',
    );
    if (!limit.allowed) throw new RateLimitError(60);
    const { docId } = await context.params;
    if (!UUID.test(docId)) throw new NotFoundError();
    const file = await openKycDocument(actor, docId);
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
