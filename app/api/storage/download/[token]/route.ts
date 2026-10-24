// path: app/api/storage/download/[token]/route.ts
// Streams a file for a signed link. A plain handler (not withApi) because the answer is binary; it applies the same
// steps by hand: correlation id, rate limit, session check, tenant check, error mapping.
import type { NextRequest } from 'next/server';
import { getService } from '@/lib/container';
import { NotFoundError, RateLimitError, errorResponse, normalizeError } from '@/lib/errors';
import { getClientIp } from '@/lib/api/client-ip';
import { resolveCorrelationId, runWithContext } from '@/lib/logger/correlation';
import { parseRange } from '@/lib/storage/range';
import { redeemSignedUrl } from '@/services/storage/signed-urls';

const INLINE_SAFE = new Set([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'application/pdf',
]);

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ token: string }> },
): Promise<Response> {
  const correlationId = resolveCorrelationId(request.headers.get('x-correlation-id'));
  return runWithContext({ correlationId }, async () => {
    try {
      const { token } = await context.params;
      const rate = await getService('security').rateLimit(getClientIp(request.headers), 'download');
      if (!rate.allowed) throw new RateLimitError(rate.retryAfterSeconds);
      const actor = await getService('auth').getActor();
      const { record, bytes, inline } = await redeemSignedUrl(token, actor);

      const range = parseRange(request.headers.get('range'), bytes.length);
      if (range === 'invalid') {
        return new Response(null, {
          status: 416,
          headers: { 'content-range': `bytes */${bytes.length}` },
        });
      }
      const body = range ? bytes.subarray(range.start, range.end + 1) : bytes;
      const showInline = inline && INLINE_SAFE.has(record.mimeType);
      const safeName = record.name.replace(/[^\w.\- ]+/g, '_');
      const headers: Record<string, string> = {
        'content-type': record.mimeType,
        'content-length': String(body.length),
        'content-disposition': `${showInline ? 'inline' : 'attachment'}; filename="${safeName}"`,
        'accept-ranges': 'bytes',
        'cache-control': 'private, no-store',
        'x-content-type-options': 'nosniff',
        'content-security-policy':
          "sandbox; default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'",
        'cross-origin-resource-policy': 'same-origin',
        'x-correlation-id': correlationId,
      };
      if (range) headers['content-range'] = `bytes ${range.start}-${range.end}/${bytes.length}`;
      return new Response(Buffer.from(body), { status: range ? 206 : 200, headers });
    } catch (thrown) {
      const error = thrown instanceof NotFoundError ? thrown : normalizeError(thrown);
      return errorResponse(error, correlationId);
    }
  });
}
