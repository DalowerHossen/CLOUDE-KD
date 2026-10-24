// path: app/api/webhooks/woocommerce/route.ts
// The address WooCommerce calls for one connected store (the random key is in the query). The signature (X-WC-Webhook-Signature,
// the base64 HMAC-SHA256 of the raw body with the webhook secret the platform made) is checked before the body is parsed; the
// delivery id (X-WC-Webhook-Delivery-ID) is kept once. Answers 200 when the delivery was handled.
import type { NextRequest } from 'next/server';
import { handleStoreWebhook } from '@/services/integration/commerce-webhook';

export async function POST(request: NextRequest): Promise<Response> {
  return handleStoreWebhook(request, 'woocommerce');
}
