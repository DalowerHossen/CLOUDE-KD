// path: app/api/webhooks/nmi-signup/route.ts
// Application and merchant events of NMI's Merchant Sign-Up API (docs/processors/nmi.md section 13). The header `Signature`
// is the hex HMAC-SHA256 of the raw body under the sign-up webhook secret. 200 accepted or repeated, 401 bad signature,
// 400 unreadable.
import type { NextRequest } from 'next/server';
import { getClientIp } from '@/lib/api/client-ip';
import { getService } from '@/lib/container';
import { RateLimitError, ValidationError, errorResponse, normalizeError } from '@/lib/errors';
import { resolveCorrelationId, runWithContext } from '@/lib/logger/correlation';
import { handleSignupWebhook } from '@/services/payment/onboarding';

const MAX_BODY_BYTES = 200_000;

export async function POST(request: NextRequest): Promise<Response> {
  const correlationId = resolveCorrelationId(request.headers.get('x-correlation-id'));
  return runWithContext({ correlationId }, async () => {
    try {
      const rate = await getService('security').rateLimit(getClientIp(request.headers), 'webhook');
      if (!rate.allowed) throw new RateLimitError(rate.retryAfterSeconds);
      const declared = request.headers.get('content-length');
      if (declared !== null && /^\d{1,9}$/.test(declared) && +declared > MAX_BODY_BYTES)
        return new Response(null, { status: 413 });
      const rawBody = await request.text();
      if (new TextEncoder().encode(rawBody).byteLength > MAX_BODY_BYTES)
        return new Response(null, { status: 413 });
      const signature = request.headers.get('signature') ?? '';
      if (signature === '') return new Response(null, { status: 401 });
      try {
        await handleSignupWebhook(rawBody, signature);
      } catch (thrown) {
        if (thrown instanceof ValidationError && /signature/.test(thrown.message))
          return new Response(null, { status: 401 });
        throw thrown;
      }
      return Response.json({ received: true }, { status: 200 });
    } catch (thrown) {
      return errorResponse(normalizeError(thrown), correlationId);
    }
  });
}
