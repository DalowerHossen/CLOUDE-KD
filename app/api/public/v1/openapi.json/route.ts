// path: app/api/public/v1/openapi.json/route.ts
import type { NextRequest } from 'next/server';
import { getClientIp } from '@/lib/api/client-ip';
import { getService } from '@/lib/container';
import { RateLimitError, errorResponse, normalizeError } from '@/lib/errors';
import { buildOpenApi } from '@/lib/integrations/openapi';
import { ENDPOINTS } from '@/lib/integrations/public-registry';
import { resolveCorrelationId } from '@/lib/logger/correlation';

const document = JSON.stringify(buildOpenApi(ENDPOINTS));

/** The OpenAPI 3.1 document of the public API, open to everyone. */
export async function GET(request: NextRequest): Promise<Response> {
  const correlationId = resolveCorrelationId(request.headers.get('x-correlation-id'));
  try {
    const rate = await getService('security').rateLimit(
      `public-openapi:${getClientIp(request.headers)}`,
      'api-default',
    );
    if (!rate.allowed) throw new RateLimitError(rate.retryAfterSeconds);
    return new Response(document, {
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'public, max-age=300',
        'x-correlation-id': correlationId,
      },
    });
  } catch (error) {
    return errorResponse(normalizeError(error), correlationId);
  }
}
