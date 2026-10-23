// path: app/api/webhooks/shopify/route.ts
// The address Shopify calls for one connected store (the random key is in the query). The signature (X-Shopify-Hmac-Sha256, the
// base64 HMAC-SHA256 of the raw body with the client secret of the app) is checked before the body is parsed; a delivery id
// (X-Shopify-Webhook-Id) that was seen already does nothing. Answers 200 when the delivery was handled.
import type { NextRequest } from 'next/server';
import { handleStoreWebhook } from '@/services/integration/commerce-webhook';

export async function POST(request: NextRequest): Promise<Response> {
  return handleStoreWebhook(request, 'shopify');
}
