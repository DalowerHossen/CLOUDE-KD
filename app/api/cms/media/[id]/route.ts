// path: app/api/cms/media/[id]/route.ts
// Serves an image of the media library to everyone. A plain handler because the answer is binary; only platform
// images of the CMS category are served (see readPublicMedia).
import { NotFoundError, errorResponse, normalizeError } from '@/lib/errors';
import { resolveCorrelationId } from '@/lib/logger/correlation';
import { readPublicMedia } from '@/services/cms/media';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const correlationId = resolveCorrelationId(request.headers.get('x-correlation-id'));
  try {
    const { id } = await context.params;
    if (!UUID.test(id)) throw new NotFoundError();
    const media = await readPublicMedia(id);
    return new Response(Buffer.from(media.bytes), {
      headers: {
        'content-type': media.mimeType,
        'content-length': String(media.bytes.length),
        // A file id never points to other bytes, so the answer can be kept for a long time.
        'cache-control': 'public, max-age=86400, immutable',
        'x-content-type-options': 'nosniff',
        'content-security-policy': "default-src 'none'; sandbox",
        'cross-origin-resource-policy': 'cross-origin',
      },
    });
  } catch (thrown) {
    return errorResponse(normalizeError(thrown), correlationId);
  }
}
