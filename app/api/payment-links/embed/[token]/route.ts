// path: app/api/payment-links/embed/[token]/route.ts
// Public: may this web site show this payment link in the embedded checkout? The merchant SDK asks before it draws a frame.
// 404 = the link cannot be paid (unknown, expired, used, revoked); 403 = the link is fine but the calling web site is not
// on the merchant's list. A listed site gets the CORS header with its own entry of the merchant's list (never the raw
// request header); the 403 and 404 refusals carry a literal * so the SDK can read why. No answer carries payer or invoice data.
import type { NextRequest } from 'next/server';
import { withApi } from '@/lib/api/with-api';
import { normalizeOrigin } from '@/lib/payment/embed-sdk/rules';
import { tokenParam } from '@/schemas/payment/payments';
import { embedConfigFor } from '@/services/payment/embed';

const handler = withApi(
  {
    id: 'paymentLinks.embedConfig',
    scope: 'public',
    networkContext: 'payment',
    params: tokenParam,
  },
  async ({ params, request }) => {
    // A malformed Origin header is kept as it is, so it matches nothing on the list and is refused.
    const raw = request.headers.get('origin');
    const origin = raw === null ? null : (normalizeOrigin(raw) ?? raw);
    const { config, allowedOrigin } = await embedConfigFor(params.token, origin);
    // The CORS header carries the entry of the merchant's own list, never the request header itself.
    return {
      data: config,
      headers: {
        vary: 'Origin',
        ...(allowedOrigin ? { 'access-control-allow-origin': allowedOrigin } : {}),
      },
    };
  },
);

type Context = Parameters<typeof handler>[1];

export async function GET(request: NextRequest, context: Context): Promise<Response> {
  const response = await handler(request, context);
  // The refusals carry no data. A literal "*" lets the SDK on any site read why (the SDK sends no cookies).
  if (response.status === 403 || response.status === 404)
    response.headers.set('access-control-allow-origin', '*');
  response.headers.append('vary', 'Origin');
  return response;
}
