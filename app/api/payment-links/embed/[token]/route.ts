// path: app/api/payment-links/embed/[token]/route.ts
// Public: may this web site show this payment link in the embedded checkout? The merchant SDK asks before it draws a frame.
// 404 = the link cannot be paid (unknown, expired, used, revoked); 403 = the link is fine but the calling web site is not
// on the merchant's list. A browser on a listed site (and on the 403/404 answers, so the SDK can read why) gets the
// CORS header for its own origin only; the answers carry no payer or invoice data.
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
    return { data: await embedConfigFor(params.token, origin) };
  },
);

type Context = Parameters<typeof handler>[1];

export async function GET(request: NextRequest, context: Context): Promise<Response> {
  const response = await handler(request, context);
  const raw = request.headers.get('origin');
  const origin = raw === null ? null : normalizeOrigin(raw);
  response.headers.append('vary', 'Origin');
  if (origin !== null && [200, 403, 404].includes(response.status))
    response.headers.set('access-control-allow-origin', origin);
  return response;
}
