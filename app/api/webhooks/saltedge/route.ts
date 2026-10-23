// path: app/api/webhooks/saltedge/route.ts
// The address Salt Edge calls for one bank link (the random key is in the query; the owner pastes the address on the Callbacks page
// of the Salt Edge dashboard). The Signature header (RSA, over "callback_url|body") is checked with the Salt Edge key before the
// body is parsed. Answers 200 when the callback was handled.
import type { NextRequest } from 'next/server';
import { handleBankWebhook } from '@/services/bankfeed/webhook';

export async function POST(request: NextRequest): Promise<Response> {
  return handleBankWebhook(request, 'saltedge');
}
