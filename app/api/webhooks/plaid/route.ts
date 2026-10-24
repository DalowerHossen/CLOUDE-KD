// path: app/api/webhooks/plaid/route.ts
// The address Plaid calls for one bank link (the random key is in the query). The Plaid-Verification token (ES256, at most 5 minutes
// old, naming the SHA-256 of the raw body) is checked before the body is parsed. Answers 200 when the message was handled.
import type { NextRequest } from 'next/server';
import { handleBankWebhook } from '@/services/bankfeed/webhook';

export async function POST(request: NextRequest): Promise<Response> {
  return handleBankWebhook(request, 'plaid');
}
