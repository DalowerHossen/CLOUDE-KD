// path: app/api/webhooks/kyc/sumsub/route.ts
// The address the online verification service calls with the result of an identity check. The signature header is checked
// against the raw body BEFORE anything is parsed; a bad signature gets 401 and is counted as a security event.
import type { NextRequest } from 'next/server';
import { getClientIp } from '@/lib/api/client-ip';
import { getService } from '@/lib/container';
import { errorResponse, normalizeError, PayloadTooLargeError, RateLimitError } from '@/lib/errors';
import { createLogger } from '@/lib/logger';
import { resolveCorrelationId, runWithContext } from '@/lib/logger/correlation';
import { handleProviderWebhook } from '@/services/kyc/provider';

const log = createLogger({ route: 'webhooks.kyc.sumsub' });
const MAX_BYTES = 262_144;

const plain = (status: number, text: string): Response =>
  new Response(text, {
    status,
    headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' },
  });

export async function POST(request: NextRequest): Promise<Response> {
  const correlationId = resolveCorrelationId(request.headers.get('x-correlation-id'));
  return runWithContext({ correlationId }, async () => {
    try {
      const declared = request.headers.get('content-length');
      if (declared !== null && /^\d+$/.test(declared) && Number.parseInt(declared, 10) > MAX_BYTES)
        throw new PayloadTooLargeError();
      const raw = await request.text();
      if (new TextEncoder().encode(raw).byteLength > MAX_BYTES) throw new PayloadTooLargeError();
      const result = await handleProviderWebhook(
        raw,
        request.headers.get('x-payload-digest'),
        request.headers.get('x-payload-digest-alg'),
      );
      if (result === 'bad_signature') {
        const ip = getClientIp(request.headers);
        const security = getService('security');
        await security.raiseSecurityEvent('webhook_signature_invalid', {
          source: 'kyc-sumsub',
          ip,
        });
        const attempt = await security.rateLimit(`kyc-webhook-bad:${ip}`, 'strict');
        if (!attempt.allowed) throw new RateLimitError(attempt.retryAfterSeconds);
        return plain(401, 'Invalid signature');
      }
      return plain(200, 'ok');
    } catch (error) {
      const app = normalizeError(error);
      if (app.status >= 500) log.error('kyc webhook failed', { error });
      return errorResponse(app, correlationId);
    }
  });
}
