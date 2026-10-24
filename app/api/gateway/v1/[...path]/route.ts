// path: app/api/gateway/v1/[...path]/route.ts
// The entry of the sub-merchant gateway. A sub-merchant calls `/api/gateway/v1/<path>` with its key; the platform checks the key and
// the route and calls the app of the main merchant (see services/gateway/forward.ts and docs/integrations/gateway.md). The key is
// the only credential: no session, no cookie, so the route is exempt from the browser CSRF check like the public API.
import type { NextRequest } from 'next/server';
import { GATEWAY_MAX_REQUEST_BYTES } from '@/config/s16-gateway';
import { getClientIp } from '@/lib/api/client-ip';
import { resolveCorrelationId, runWithContext } from '@/lib/logger/correlation';
import { forward } from '@/services/gateway/forward';
import { makeForwardPorts } from '@/services/gateway/ports';

export const runtime = 'nodejs';

const PREFIX = '/api/gateway/v1';

async function handle(request: NextRequest): Promise<Response> {
  const correlationId = resolveCorrelationId(request.headers.get('x-correlation-id'));
  return runWithContext({ correlationId }, async () => {
    const declared = request.headers.get('content-length');
    if (
      declared !== null &&
      /^\d{1,12}$/.test(declared) &&
      Number.parseInt(declared, 10) > GATEWAY_MAX_REQUEST_BYTES
    )
      return Response.json(
        {
          error: {
            code: 'payload_too_large',
            message: 'The request is too large.',
            details: null,
            correlation_id: correlationId,
          },
        },
        { status: 413, headers: { 'x-correlation-id': correlationId } },
      );
    const body = request.method === 'GET' || request.method === 'HEAD' ? '' : await request.text();
    const path = request.nextUrl.pathname.slice(PREFIX.length) || '/';
    const result = await forward(makeForwardPorts(), {
      authorization: request.headers.get('authorization'),
      ip: getClientIp(request.headers),
      method: request.method,
      path,
      search: request.nextUrl.search,
      body,
      accept: request.headers.get('accept'),
      idempotencyKey: request.headers.get('idempotency-key'),
      correlationId,
    });
    const payload = typeof result.body === 'string' ? result.body : new Uint8Array(result.body);
    return new Response(result.status === 204 ? null : payload, {
      status: result.status,
      headers: result.headers,
    });
  });
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
