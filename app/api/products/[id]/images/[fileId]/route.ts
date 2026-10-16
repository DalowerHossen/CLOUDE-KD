// path: app/api/products/[id]/images/[fileId]/route.ts
// A plain handler: the answer is an image. It reads only a picture of a product of the signed-in company, and only
// for a person who may see products.
import { getService } from '@/lib/container';
import {
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
  errorResponse,
  normalizeError,
} from '@/lib/errors';
import { resolveCorrelationId } from '@/lib/logger/correlation';
import { readImage } from '@/services/product/images';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string; fileId: string }> },
): Promise<Response> {
  const correlationId = resolveCorrelationId(request.headers.get('x-correlation-id'));
  try {
    const { id, fileId } = await context.params;
    if (!UUID.test(id) || !UUID.test(fileId)) throw new NotFoundError();
    const actor = await getService('auth').getActor();
    if (!actor) throw new UnauthorizedError();
    if (!actor.companyId) throw new NotFoundError();
    if (!(await getService('permissions').can(actor, 'product.read', { type: 'product' })))
      throw new ForbiddenError();
    const image = await readImage(actor.companyId, id, fileId);
    return new Response(Buffer.from(image.bytes), {
      headers: {
        'content-type': image.mimeType,
        'content-length': String(image.bytes.length),
        'cache-control': 'private, max-age=300',
        'x-content-type-options': 'nosniff',
        'content-security-policy': "default-src 'none'; sandbox",
      },
    });
  } catch (thrown) {
    return errorResponse(normalizeError(thrown), correlationId);
  }
}
