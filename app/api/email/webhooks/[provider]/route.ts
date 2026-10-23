// path: app/api/email/webhooks/[provider]/route.ts
// Delivery feedback from the mail provider (delivery, opens, clicks, bounces, complaints). The signature is checked
// before the body is read. The secret comes from the provider settings of the company named by ?c=, or of the platform.
import type { NextRequest } from 'next/server';
import { getService } from '@/lib/container';
import { RateLimitError, errorResponse, normalizeError } from '@/lib/errors';
import { getClientIp } from '@/lib/api/client-ip';
import {
  parseMailgun,
  parsePostmark,
  parseResend,
  parseSendgrid,
  type InboundResult,
} from '@/lib/email/inbound';
import { resolveCorrelationId, runWithContext } from '@/lib/logger/correlation';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { loadRows, openCredential } from '@/services/email/settings-store';

const PROVIDERS = new Set(['resend', 'mailgun', 'postmark', 'sendgrid']);
const UUID = /^[0-9a-f-]{36}$/i;

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ provider: string }> },
): Promise<Response> {
  const correlationId = resolveCorrelationId(request.headers.get('x-correlation-id'));
  return runWithContext({ correlationId }, async () => {
    try {
      const { provider } = await context.params;
      if (!PROVIDERS.has(provider)) return new Response(null, { status: 404 });
      const rate = await getService('security').rateLimit(getClientIp(request.headers), 'webhook');
      if (!rate.allowed) throw new RateLimitError(rate.retryAfterSeconds);
      const company = request.nextUrl.searchParams.get('c');
      if (company !== null && !UUID.test(company)) return new Response(null, { status: 404 });
      const body = await request.text();
      if (new TextEncoder().encode(body).byteLength > 1_000_000)
        return new Response(null, { status: 413 });

      const rows = (await loadRows(company)).filter((r) => r.provider === provider && r.enabled);
      let verdict: InboundResult = { ok: false, reason: 'bad_signature' };
      for (const row of rows) {
        const { webhookSecret } = await openCredential(row);
        if (!webhookSecret) continue;
        if (provider === 'resend') verdict = parseResend(request.headers, body, webhookSecret);
        else if (provider === 'mailgun') verdict = parseMailgun(body, webhookSecret);
        else if (provider === 'sendgrid')
          verdict = parseSendgrid(request.headers, body, webhookSecret);
        else {
          // Postmark: the secret is stored as "user:password" and sent as basic authentication.
          const [user = '', ...rest] = webhookSecret.split(':');
          verdict = parsePostmark(request.headers.get('authorization'), body, user, rest.join(':'));
        }
        if (verdict.ok) break;
      }
      if (!verdict.ok) {
        await getService('security').raiseSecurityEvent('webhook_signature_invalid', {
          source: 'email',
          provider,
        });
        return new Response(null, { status: 401 });
      }
      const admin = getAdminSupabase();
      for (const event of verdict.events) {
        await admin.rpc('kd_email_event', {
          p_provider_message_id: event.providerMessageId,
          p_kind: event.kind,
        });
      }
      return new Response(null, { status: 200 });
    } catch (thrown) {
      return errorResponse(normalizeError(thrown), correlationId);
    }
  });
}
