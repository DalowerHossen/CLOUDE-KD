// path: app/api/social/l/[code]/route.ts
// A tracked social link. The target comes from the database for this code only (never from the request). Unknown codes give 404.
import { getClientIp } from '@/lib/api/client-ip';
import { getService } from '@/lib/container';
import { errorResponse, normalizeError, RateLimitError } from '@/lib/errors';
import { resolveCorrelationId } from '@/lib/logger/correlation';
import { clickThrough } from '@/services/social/links';

export async function GET(
  request: Request,
  context: { params: Promise<{ code: string }> },
): Promise<Response> {
  const correlationId = resolveCorrelationId(request.headers.get('x-correlation-id'));
  try {
    const rate = await getService('security').rateLimit(getClientIp(request.headers), 'download');
    if (!rate.allowed) throw new RateLimitError(rate.retryAfterSeconds);
    const { code } = await context.params;
    const target = await clickThrough(code);
    if (target === null) return new Response(null, { status: 404 });
    return new Response(null, {
      status: 302,
      headers: { location: target, 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' },
    });
  } catch (error) {
    return errorResponse(normalizeError(error), correlationId);
  }
}
