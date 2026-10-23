// path: services/bankfeed/webhook.ts
// The two bank webhook routes share this: the size limit, the link behind the key, the check of the sender BEFORE the body is parsed
// (Plaid: a signed token whose key is fetched with the keys of the company; Salt Edge: an RSA signature of "callback_url|body"),
// and what each message means. A bad sender raises a security event and is rate limited. Messages can repeat and come in any
// order; every action here is safe to repeat.
import 'server-only';
import type { NextRequest } from 'next/server';
import { BANKFEED_WEBHOOK_MAX_BYTES } from '@/config/s16-bankfeed';
import { getClientIp } from '@/lib/api/client-ip';
import { getService } from '@/lib/container';
import { errorResponse, normalizeError, PayloadTooLargeError, RateLimitError } from '@/lib/errors';
import {
  needsReauth,
  nowSeconds,
  parsePlaidWebhook,
  parseSaltEdgeCallback,
  plaidTokenHeader,
  saltedgeNeedsReauth,
  verifyPlaidWebhook,
  verifySaltEdgeCallback,
  wholeNumber,
} from '@/lib/integrations/bank-rules';
import * as plaid from '@/lib/integrations/plaid';
import { createLogger } from '@/lib/logger';
import { resolveCorrelationId, runWithContext, updateContext } from '@/lib/logger/correlation';
import { getAdminSupabase } from '@/lib/supabase/admin';
import {
  completePlaidLink,
  completeSaltEdgeLink,
  connectionByKey,
  itemMatches,
  markDisconnected,
  markError,
  markNeedsReauth,
  plaidKeys,
  webhookUrlOf,
  type WebhookBankConnection,
} from './connections';
import { syncConnection } from './sync';

const log = createLogger({ route: 'webhooks.bankfeed' });

const plain = (status: number, text: string): Response =>
  new Response(text, {
    status,
    headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' },
  });

/** Keys of Plaid webhooks by key id (they change rarely). */
const keyCache = new Map<string, { jwk: Record<string, unknown>; at: number }>();
const KEY_TTL_MS = 3_600_000;

async function plaidSenderOk(
  conn: WebhookBankConnection,
  jwt: string | null,
  raw: string,
): Promise<boolean> {
  if (jwt === null || jwt === '') return false;
  const header = plaidTokenHeader(jwt);
  if (header === null || header.alg !== 'ES256') return false;
  const cacheKey = `${conn.id}:${header.kid}`;
  const hit = keyCache.get(cacheKey);
  let jwk = hit !== undefined && Date.now() - hit.at < KEY_TTL_MS ? hit.jwk : null;
  if (jwk === null) {
    try {
      jwk = await plaid.webhookKey(plaidKeys(conn.secrets), header.kid);
    } catch {
      return false;
    }
    keyCache.set(cacheKey, { jwk, at: Date.now() });
  }
  return verifyPlaidWebhook(jwt, jwk, raw, nowSeconds());
}

async function syncQuietly(conn: WebhookBankConnection): Promise<void> {
  try {
    await syncConnection(conn.companyId, conn.id);
  } catch (error) {
    // The problem is written to the link; the job tries again. The sender is answered 200 so it does not repeat the message.
    log.warn('sync after a webhook failed', {
      connectionId: conn.id,
      error: error instanceof Error ? error.message : 'error',
    });
  }
}

async function handlePlaid(conn: WebhookBankConnection, json: unknown): Promise<void> {
  const event = parsePlaidWebhook(json);
  if (conn.status === 'disconnected') return;
  if (event.kind === 'session_finished') {
    if (event.status !== 'success' || event.linkToken === '' || event.linkToken !== conn.linkToken)
      return;
    const first = event.publicTokens[0];
    if (first !== undefined) await completePlaidLink(conn.companyId, conn.id, first);
    else if (conn.externalId !== null) {
      // A session in update mode brings no new token: the old link works again.
      await getAdminSupabase()
        .from('bank_feed_connections')
        .update({ status: 'active', last_error: null, reauth_notified_at: null, link_token: null })
        .eq('company_id', conn.companyId)
        .eq('id', conn.id);
    }
    await syncQuietly({ ...conn, status: 'active' });
    return;
  }
  if (event.kind === 'sync_updates') {
    if (itemMatches(conn, event.itemId) && conn.status === 'active') await syncQuietly(conn);
    return;
  }
  if (event.kind === 'item_problem') {
    if (!itemMatches(conn, event.itemId)) return;
    if (needsReauth(event.code))
      await markNeedsReauth(conn.companyId, conn.id, `Plaid: ${event.code}`);
    return;
  }
  if (event.kind === 'login_repaired' && itemMatches(conn, event.itemId)) {
    await getAdminSupabase()
      .from('bank_feed_connections')
      .update({ status: 'active', last_error: null, reauth_notified_at: null })
      .eq('company_id', conn.companyId)
      .eq('id', conn.id)
      .eq('status', 'needs_reauth');
  }
}

async function handleSaltEdge(conn: WebhookBankConnection, json: unknown): Promise<void> {
  const event = parseSaltEdgeCallback(json);
  if (event.kind === 'ignored' || conn.status === 'disconnected') return;
  // The session was started by the platform for this link: the reference it put in custom_fields says so, and a connection that
  // is already known has to be the same one.
  if (event.appRef !== '' && event.appRef !== conn.id) return;
  if (conn.externalId !== null && conn.externalId !== event.connectionId) return;
  if (event.kind === 'success') {
    if (conn.externalId === null) {
      if (event.appRef !== conn.id) return;
      await completeSaltEdgeLink(conn.companyId, conn.id, event.connectionId);
    } else if (conn.status !== 'active') {
      await getAdminSupabase()
        .from('bank_feed_connections')
        .update({ status: 'active', last_error: null, reauth_notified_at: null })
        .eq('company_id', conn.companyId)
        .eq('id', conn.id);
    }
    await syncQuietly({ ...conn, status: 'active', externalId: event.connectionId });
    return;
  }
  if (event.kind === 'fail') {
    if (saltedgeNeedsReauth(event.errorClass) && conn.externalId !== null)
      await markNeedsReauth(conn.companyId, conn.id, `Salt Edge: ${event.errorClass}`);
    else await markError(conn.companyId, conn.id, `Salt Edge: ${event.errorClass}`);
    return;
  }
  if (event.kind === 'consent') {
    if (event.status === 'expired' || event.status === 'revoked')
      await markNeedsReauth(conn.companyId, conn.id, `Salt Edge: consent ${event.status}`);
    return;
  }
  if (event.kind === 'destroy' && conn.externalId === event.connectionId)
    await markDisconnected(conn.companyId, conn.id);
}

export async function handleBankWebhook(
  request: NextRequest,
  provider: 'plaid' | 'saltedge',
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
        wholeNumber(declared) > BANKFEED_WEBHOOK_MAX_BYTES
      )
        throw new PayloadTooLargeError();
      const raw = await request.text();
      if (new TextEncoder().encode(raw).byteLength > BANKFEED_WEBHOOK_MAX_BYTES)
        throw new PayloadTooLargeError();
      const key = request.nextUrl.searchParams.get('k') ?? '';
      const conn = await connectionByKey(key);
      if (!conn || conn.provider !== provider) {
        const attempt = await security.rateLimit(`bank-webhook-unknown:${ip}`, 'strict');
        if (!attempt.allowed) throw new RateLimitError(attempt.retryAfterSeconds);
        return plain(404, 'Not found');
      }
      updateContext({ companyId: conn.companyId });
      const h = request.headers;
      const signed =
        provider === 'plaid'
          ? await plaidSenderOk(conn, h.get('plaid-verification'), raw)
          : verifySaltEdgeCallback(
              webhookUrlOf('saltedge', key),
              raw,
              h.get('signature'),
              h.get('signature-key-version'),
            );
      if (!signed) {
        await security.raiseSecurityEvent('webhook_signature_invalid', {
          source: `bank.${provider}`,
          companyId: conn.companyId,
          ip,
        });
        const attempt = await security.rateLimit(`bank-webhook-bad:${conn.id}`, 'strict');
        if (!attempt.allowed) throw new RateLimitError(attempt.retryAfterSeconds);
        return plain(401, 'Invalid signature');
      }
      let json: unknown;
      try {
        json = JSON.parse(raw);
      } catch {
        return plain(400, 'Invalid body');
      }
      if (provider === 'plaid') await handlePlaid(conn, json);
      else await handleSaltEdge(conn, json);
      return plain(200, 'ok');
    } catch (error) {
      const app = normalizeError(error);
      if (app.status >= 500) log.error('bank webhook failed', { error });
      return errorResponse(app, correlationId);
    }
  });
}
