// path: lib/payment/webhook-route.ts
// The one handler every processor webhook route uses (app/api/webhooks/<id>/route.ts of STEP 11 and 12):
//   export const POST = processorWebhookRoute('stripe');
// It limits the rate, reads the raw body (size capped), hands both to the webhook core and answers with a status that
// tells the processor what to do: 200 accepted or repeat, 401 bad signature, 404 unknown, 400 unreadable.
import 'server-only';
import type { NextRequest } from 'next/server';
import { getClientIp } from '@/lib/api/client-ip';
import { getService } from '@/lib/container';
import { RateLimitError, errorResponse, normalizeError } from '@/lib/errors';
import { resolveCorrelationId, runWithContext } from '@/lib/logger/correlation';
import type { ProcessorId } from '@/types/contracts';
import { receiveWebhook } from '@/services/payment/webhook-core';

const MAX_BODY_BYTES = 1_000_000;

export function processorWebhookRoute(
  processorId: ProcessorId,
): (request: NextRequest) => Promise<Response> {
  return async (request) => {
    const correlationId = resolveCorrelationId(request.headers.get('x-correlation-id'));
    return runWithContext({ correlationId }, async () => {
      try {
        const rate = await getService('security').rateLimit(
          getClientIp(request.headers),
          'webhook',
        );
        if (!rate.allowed) throw new RateLimitError(rate.retryAfterSeconds);
        const declared = request.headers.get('content-length');
        if (declared !== null && /^\d{1,9}$/.test(declared) && +declared > MAX_BODY_BYTES) {
          return new Response(null, { status: 413 });
        }
        const rawBody = await request.text();
        if (rawBody.length > MAX_BODY_BYTES) return new Response(null, { status: 413 });
        const headers: Record<string, string> = {};
        request.headers.forEach((value, key) => {
          headers[key.toLowerCase()] = value;
        });
        const outcome = await receiveWebhook(processorId, { headers, rawBody });
        switch (outcome.kind) {
          case 'unknown_processor':
            return new Response(null, { status: 404 });
          case 'invalid_signature':
            return new Response(null, { status: 401 });
          case 'bad_payload':
            return new Response(null, { status: 400 });
          case 'duplicate':
          case 'accepted':
            return Response.json({ received: true }, { status: 200 });
        }
      } catch (thrown) {
        return errorResponse(normalizeError(thrown), correlationId);
      }
    });
  };
}
