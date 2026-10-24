// path: services/integration/commerce-webhook.ts
// The common part of the two store webhook routes: the size limit, the store behind the key, the signature check BEFORE the body is
// parsed, the topic list, and the hand-over to the order service. Every failure for an unknown key or a bad signature looks the
// same to the caller; a bad signature raises a security event.
import 'server-only';
import type { NextRequest } from 'next/server';
import { COMMERCE_WEBHOOK_MAX_BYTES } from '@/config/s16-commerce';
import { getClientIp } from '@/lib/api/client-ip';
import { getService } from '@/lib/container';
import { errorResponse, normalizeError, PayloadTooLargeError, RateLimitError } from '@/lib/errors';
import { createLogger } from '@/lib/logger';
import { resolveCorrelationId, runWithContext, updateContext } from '@/lib/logger/correlation';
import { verifyShopifySignature, verifyWooSignature } from '@/lib/integrations/mapping-rules';
import { sha256Hex } from '@/lib/utils/hash';
import { connectionByKey } from './connections';
import { handleDelivery } from './commerce-orders';

const log = createLogger({ route: 'webhooks.commerce' });

const TOPICS: Record<'shopify' | 'woocommerce', readonly string[]> = {
  shopify: ['orders/create', 'orders/updated', 'refunds/create'],
  woocommerce: ['order.created', 'order.updated'],
};

const plain = (status: number, text: string): Response =>
  new Response(text, {
    status,
    headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' },
  });

export async function handleStoreWebhook(
  request: NextRequest,
  provider: 'shopify' | 'woocommerce',
): Promise<Response> {
  const correlationId = resolveCorrelationId(request.headers.get('x-correlation-id'));
  return runWithContext({ correlationId }, async () => {
    try {
      const ip = getClientIp(request.headers);
      const security = getService('security');
      const declared = request.headers.get('content-length');
      if (
        declared !== null &&
        /^\d+$/.test(declared) &&
        Number.parseInt(declared, 10) > COMMERCE_WEBHOOK_MAX_BYTES
      )
        throw new PayloadTooLargeError();
      const raw = await request.text();
      if (new TextEncoder().encode(raw).byteLength > COMMERCE_WEBHOOK_MAX_BYTES)
        throw new PayloadTooLargeError();
      const conn = await connectionByKey(request.nextUrl.searchParams.get('k') ?? '');
      if (!conn || conn.provider !== provider) {
        const attempt = await security.rateLimit(`commerce-webhook-unknown:${ip}`, 'strict');
        if (!attempt.allowed) throw new RateLimitError(attempt.retryAfterSeconds);
        return plain(404, 'Not found');
      }
      updateContext({ companyId: conn.companyId });
      const h = request.headers;
      const signed =
        provider === 'shopify'
          ? await verifyShopifySignature(conn.secret, raw, h.get('x-shopify-hmac-sha256'))
          : await verifyWooSignature(conn.secret, raw, h.get('x-wc-webhook-signature'));
      const shopOk =
        provider !== 'shopify' ||
        (h.get('x-shopify-shop-domain') ?? '').toLowerCase() === conn.storeUrl.toLowerCase();
      if (!signed || !shopOk) {
        await security.raiseSecurityEvent('webhook_signature_invalid', {
          source: provider,
          companyId: conn.companyId,
          ip,
        });
        const attempt = await security.rateLimit(`commerce-webhook-bad:${conn.id}`, 'strict');
        if (!attempt.allowed) throw new RateLimitError(attempt.retryAfterSeconds);
        return plain(401, 'Invalid signature');
      }
      const topic =
        (provider === 'shopify' ? h.get('x-shopify-topic') : h.get('x-wc-webhook-topic')) ?? '';
      if (!TOPICS[provider].includes(topic)) return plain(200, 'ok');
      let json: unknown;
      try {
        json = JSON.parse(raw);
      } catch {
        // A signed body that is not JSON (the test message of a new WooCommerce webhook) is not an order.
        return plain(200, 'ok');
      }
      const id =
        (provider === 'shopify'
          ? h.get('x-shopify-webhook-id')
          : h.get('x-wc-webhook-delivery-id')) ?? '';
      const webhookId = id !== '' ? id : `${topic}:${await sha256Hex(raw)}`;
      await handleDelivery(conn, { webhookId, topic, json });
      return plain(200, 'ok');
    } catch (error) {
      const app = normalizeError(error);
      if (app.status >= 500) log.error('store webhook failed', { error });
      return errorResponse(app, correlationId);
    }
  });
}
