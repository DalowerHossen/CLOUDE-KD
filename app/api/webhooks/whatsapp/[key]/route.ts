// path: app/api/webhooks/whatsapp/[key]/route.ts
// The address Meta calls for one company's WhatsApp account (the random key in the path says which account). GET answers the
// verification handshake with the challenge when the verify token matches. POST checks the X-Hub-Signature-256 header with the
// account's app secret BEFORE the body is parsed, then stores the updates; it answers 200 only when everything was processed, so
// Meta delivers it again otherwise (the same message id is stored once).
import type { NextRequest } from 'next/server';
import { WHATSAPP_WEBHOOK_MAX_BYTES } from '@/config/s16-whatsapp';
import { getClientIp } from '@/lib/api/client-ip';
import { getService } from '@/lib/container';
import { errorResponse, normalizeError, PayloadTooLargeError, RateLimitError } from '@/lib/errors';
import { createLogger } from '@/lib/logger';
import { resolveCorrelationId, runWithContext, updateContext } from '@/lib/logger/correlation';
import { parseWebhook, verifyMetaSignature } from '@/lib/whatsapp/rules';
import { sha256Hex, timingSafeEqualStrings } from '@/lib/utils/hash';
import { accountByWebhookKey } from '@/services/whatsapp/accounts';
import { handleWebhook } from '@/services/whatsapp/inbound';

const log = createLogger({ route: 'webhooks.whatsapp' });

interface Params {
  params: Promise<{ key: string }>;
}

const plain = (status: number, text: string): Response =>
  new Response(text, {
    status,
    headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' },
  });

export async function GET(request: NextRequest, { params }: Params): Promise<Response> {
  const { key } = await params;
  const mode = request.nextUrl.searchParams.get('hub.mode');
  const token = request.nextUrl.searchParams.get('hub.verify_token');
  const challenge = request.nextUrl.searchParams.get('hub.challenge');
  const account = await accountByWebhookKey(key).catch(() => null);
  // Every failure looks the same: an unknown address, a wrong mode and a wrong token all get 403.
  if (!account || mode !== 'subscribe' || token === null || challenge === null)
    return plain(403, 'Forbidden');
  const matches = timingSafeEqualStrings(await sha256Hex(token), account.verifyTokenHash);
  if (!matches) return plain(403, 'Forbidden');
  return plain(200, challenge);
}

export async function POST(request: NextRequest, { params }: Params): Promise<Response> {
  const correlationId = resolveCorrelationId(request.headers.get('x-correlation-id'));
  return runWithContext({ correlationId }, async () => {
    try {
      const { key } = await params;
      const ip = getClientIp(request.headers);
      const security = getService('security');
      const declared = request.headers.get('content-length');
      if (
        declared !== null &&
        /^\d+$/.test(declared) &&
        Number.parseInt(declared, 10) > WHATSAPP_WEBHOOK_MAX_BYTES
      )
        throw new PayloadTooLargeError();
      const raw = await request.text();
      if (new TextEncoder().encode(raw).byteLength > WHATSAPP_WEBHOOK_MAX_BYTES)
        throw new PayloadTooLargeError();
      const account = await accountByWebhookKey(key);
      if (!account) {
        const attempt = await security.rateLimit(`whatsapp-webhook-unknown:${ip}`, 'strict');
        if (!attempt.allowed) throw new RateLimitError(attempt.retryAfterSeconds);
        return plain(404, 'Not found');
      }
      updateContext({ companyId: account.companyId });
      const signed = await verifyMetaSignature(
        account.appSecret,
        raw,
        request.headers.get('x-hub-signature-256'),
      );
      if (!signed) {
        await security.raiseSecurityEvent('webhook_signature_invalid', {
          source: 'whatsapp',
          companyId: account.companyId,
          ip,
        });
        const attempt = await security.rateLimit(`whatsapp-webhook-bad:${account.id}`, 'strict');
        if (!attempt.allowed) throw new RateLimitError(attempt.retryAfterSeconds);
        return plain(401, 'Invalid signature');
      }
      let json: unknown;
      try {
        json = JSON.parse(raw);
      } catch {
        return plain(400, 'Invalid body');
      }
      await handleWebhook(account, parseWebhook(json));
      return plain(200, 'ok');
    } catch (error) {
      const app = normalizeError(error);
      if (app.status >= 500) log.error('whatsapp webhook failed', { error });
      return errorResponse(app, correlationId);
    }
  });
}
