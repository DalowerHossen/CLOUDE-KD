// path: services/messaging/routing.ts
// The routing engine. A message to one client goes through the channels of its route in order (the route of its kind, or e-mail
// then WhatsApp; the client's preferred channel first; channels the client blocked are left out). A channel that refuses (no
// address, no consent, WhatsApp rules) or fails is passed over, and the next one is tried; the first that sends wins. Quiet hours of
// the company hold a message until they end. Every attempt is kept on the message, with the reason, and the cost of the channel
// that sent it is recorded. The cron job sends what waits, puts back messages stuck in "sending", and copies delivery and
// engagement (opened or read) from the e-mail outbox and the WhatsApp messages.
import 'server-only';
import {
  DEFAULT_CHAIN,
  ENGAGEMENT_WINDOW_DAYS,
  MESSAGE_BATCH,
  type MessagingChannel,
} from '@/config/s16-messaging';
import { ConflictError, InternalError, NotFoundError, ValidationError } from '@/lib/errors';
import { createLogger } from '@/lib/logger';
import { inQuiet, messageInput, quietEnds, resolveChain, runChain } from '@/lib/messaging/rules';
import { getAdminSupabase } from '@/lib/supabase/admin';
import type { Actor } from '@/types/contracts';
import { mapIntegrationError } from '@/services/publicapi/db-errors';
import { trySend, type Attempt, type Outgoing } from './channels';
import { getSettings, loadTarget, need, record } from './db';
import { getPrefs, listRoutes } from './preferences';

const log = createLogger({ service: 'messaging' });

const COLUMNS =
  'id, company_id, kind, route_kind, client_id, campaign_id, variant_id, status, send_after, channel_order, subject, body, whatsapp_template_id, whatsapp_values, attempts, channel, cost, email_key, whatsapp_message_id, delivered, engaged_at, sent_at, created_by, created_at';

interface Row {
  id: string;
  company_id: string;
  kind: 'notice' | 'campaign';
  route_kind: string;
  client_id: string;
  campaign_id: string | null;
  variant_id: string | null;
  status: string;
  send_after: string;
  channel_order: string[];
  subject: string;
  body: string;
  whatsapp_template_id: string | null;
  whatsapp_values: Record<string, string>;
  attempts: Attempt[];
  channel: string | null;
  cost: string;
  email_key: string | null;
  whatsapp_message_id: string | null;
  delivered: boolean;
  engaged_at: string | null;
  sent_at: string | null;
  created_by: string | null;
  created_at: string;
}

export interface MessageView {
  id: string;
  kind: 'notice' | 'campaign';
  routeKind: string;
  clientId: string;
  campaignId: string | null;
  status: 'queued' | 'held' | 'sending' | 'sent' | 'skipped' | 'failed' | 'cancelled';
  sendAfter: string;
  channelOrder: string[];
  channel: MessagingChannel | null;
  attempts: Attempt[];
  cost: string;
  delivered: boolean;
  engaged: boolean;
  sentAt: string | null;
  createdAt: string;
}

const STATES = ['queued', 'held', 'sending', 'sent', 'skipped', 'failed', 'cancelled'] as const;
export const toView = (r: Row): MessageView => ({
  id: r.id,
  kind: r.kind,
  routeKind: r.route_kind,
  clientId: r.client_id,
  campaignId: r.campaign_id,
  status: STATES.find((s) => s === r.status) ?? 'queued',
  sendAfter: r.send_after,
  channelOrder: r.channel_order,
  channel: r.channel === 'email' || r.channel === 'whatsapp' ? r.channel : null,
  attempts: r.attempts ?? [],
  cost: r.cost,
  delivered: r.delivered,
  engaged: r.engaged_at !== null,
  sentAt: r.sent_at,
  createdAt: r.created_at,
});

async function rowOf(companyId: string, id: string): Promise<Row> {
  const { data, error } = await getAdminSupabase()
    .from('messaging_messages')
    .select(COLUMNS)
    .eq('company_id', companyId)
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw new InternalError(error);
  if (!data) throw new NotFoundError();
  return data as unknown as Row;
}

export async function getMessage(companyId: string, id: string): Promise<MessageView> {
  return toView(await rowOf(companyId, id));
}

export async function listMessages(companyId: string, limit = 50): Promise<MessageView[]> {
  const { data, error } = await getAdminSupabase()
    .from('messaging_messages')
    .select(COLUMNS)
    .eq('company_id', companyId)
    .eq('kind', 'notice')
    .is('deleted_at', null)
    .order('id', { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 200));
  if (error) throw new InternalError(error);
  return ((data ?? []) as unknown as Row[]).map(toView);
}

/** The channels to try for a client and a kind of message. */
export async function chainFor(
  companyId: string,
  clientId: string,
  routeKind: string,
): Promise<MessagingChannel[]> {
  const route = (await listRoutes(companyId)).find((r) => r.kind === routeKind && r.enabled);
  return resolveChain(route ? route.channels : DEFAULT_CHAIN, await getPrefs(companyId, clientId));
}

/**
 * Sends one message to a client through the channels of its route. With `idempotencyKey` a repeat returns the first message.
 * The message waits for the end of the quiet hours when it is made inside them.
 */
export async function submitMessage(
  actor: Actor,
  input: unknown,
  idempotencyKey?: string,
): Promise<MessageView> {
  const companyId = need(actor);
  const parsed = messageInput.safeParse(input);
  if (!parsed.success)
    throw new ValidationError(parsed.error.issues[0]?.message ?? 'The message is not valid.');
  const d = parsed.data;
  const target = await loadTarget(companyId, d.clientId);
  if (target === null) throw new NotFoundError();
  if (target.doNotContact) throw new ConflictError('The client asked not to be contacted.');
  const chain = await chainFor(companyId, d.clientId, d.routeKind);
  if (chain.length === 0)
    throw new ConflictError('The client does not want any of the channels of this message.');
  const settings = await getSettings(companyId);
  const now = new Date();
  const sendAfter = inQuiet(now, settings.quiet) ? quietEnds(now, settings.quiet) : now;
  const key = idempotencyKey ?? `notice-${crypto.randomUUID()}`;
  const admin = getAdminSupabase();
  const { data, error } = await admin
    .from('messaging_messages')
    .insert({
      company_id: companyId,
      idempotency_key: key,
      kind: 'notice',
      route_kind: d.routeKind,
      client_id: d.clientId,
      channel_order: chain,
      subject: d.subject,
      body: d.body,
      whatsapp_template_id: d.whatsappTemplateId,
      whatsapp_values: d.whatsappValues,
      send_after: sendAfter.toISOString(),
      created_by: actor.userId,
    })
    .select(COLUMNS)
    .single();
  if (error) {
    if (error.code === '23505') {
      const earlier = await admin
        .from('messaging_messages')
        .select(COLUMNS)
        .eq('company_id', companyId)
        .eq('idempotency_key', key)
        .maybeSingle();
      if (earlier.data) return toView(earlier.data as unknown as Row);
    }
    mapIntegrationError(error);
  }
  const row = data as unknown as Row;
  await record(companyId, 'messaging.message_queued', 'messaging_message', row.id, {
    kind: d.routeKind,
    channels: chain,
  });
  if (sendAfter.getTime() > now.getTime()) return toView(row);
  const claimed = await admin
    .from('messaging_messages')
    .update({ status: 'sending' })
    .eq('id', row.id)
    .eq('status', 'queued')
    .select(COLUMNS);
  if (claimed.error) throw new InternalError(claimed.error);
  const mine = (claimed.data ?? [])[0] as unknown as Row | undefined;
  if (!mine) return toView(row);
  return toView(await process(mine));
}

/** Sends a claimed message ("sending") through its channels. Returns the row as it stands afterwards. */
export async function process(row: Row): Promise<Row> {
  const admin = getAdminSupabase();
  const settings = await getSettings(row.company_id);
  const now = new Date();
  if (inQuiet(now, settings.quiet)) {
    const back = await admin
      .from('messaging_messages')
      .update({ status: 'queued', send_after: quietEnds(now, settings.quiet).toISOString() })
      .eq('id', row.id)
      .select(COLUMNS)
      .single();
    if (back.error) throw new InternalError(back.error);
    return back.data as unknown as Row;
  }
  const target = await loadTarget(row.company_id, row.client_id);
  let attempts: Attempt[] = [];
  let sent: Attempt | null = null;
  let outcome: 'sent' | 'failed' | 'skipped' = 'skipped';
  if (target === null || target.doNotContact) {
    attempts = [
      {
        channel: 'email',
        result: 'skipped',
        reason: 'The client asked not to be contacted.',
        ref: null,
      },
    ];
  } else {
    const msg: Outgoing = {
      id: row.id,
      companyId: row.company_id,
      kind: row.kind,
      subject: row.subject,
      body: row.body,
      whatsappTemplateId: row.whatsapp_template_id,
      whatsappValues: row.whatsapp_values,
      createdBy: row.created_by,
    };
    const chain = row.channel_order.filter(
      (c): c is MessagingChannel => c === 'email' || c === 'whatsapp',
    );
    ({ attempts, sent, outcome } = await runChain(chain, (ch) => trySend(ch, msg, target)));
  }
  const patch: Record<string, unknown> = { attempts };
  if (sent) {
    patch.status = 'sent';
    patch.channel = sent.channel;
    patch.sent_at = now.toISOString();
    patch.cost = sent.channel === 'email' ? settings.emailCost : settings.whatsappCost;
    if (sent.channel === 'email') patch.email_key = sent.ref;
    else patch.whatsapp_message_id = sent.ref;
  } else {
    patch.status = outcome === 'failed' ? 'failed' : 'skipped';
  }
  const done = await admin
    .from('messaging_messages')
    .update(patch)
    .eq('id', row.id)
    .eq('status', 'sending')
    .select(COLUMNS)
    .single();
  if (done.error) throw new InternalError(done.error);
  return done.data as unknown as Row;
}

/** The owner sends a failed message again. */
export async function retryMessage(actor: Actor, id: string): Promise<MessageView> {
  const companyId = need(actor);
  const row = await rowOf(companyId, id);
  if (row.status !== 'failed')
    throw new ConflictError('Only a message that failed can be sent again.');
  const { data, error } = await getAdminSupabase()
    .from('messaging_messages')
    .update({ status: 'queued', send_after: new Date().toISOString() })
    .eq('id', id)
    .eq('status', 'failed')
    .select('id');
  if (error) mapIntegrationError(error);
  if ((data ?? []).length === 0)
    throw new ConflictError('The message changed. Reload and try again.');
  await record(companyId, 'messaging.message_retried', 'messaging_message', id, {});
  return getMessage(companyId, id);
}

/* ---------- cron ---------- */

/** Copies delivery and engagement from the e-mail outbox and the WhatsApp messages for messages sent in the last days. */
export async function syncEngagement(): Promise<{ updated: number }> {
  const admin = getAdminSupabase();
  const since = new Date(Date.now() - ENGAGEMENT_WINDOW_DAYS * 86_400_000).toISOString();
  const { data, error } = await admin
    .from('messaging_messages')
    .select('id, channel, email_key, whatsapp_message_id, delivered, engaged_at')
    .eq('status', 'sent')
    .gte('sent_at', since)
    .or('delivered.eq.false,engaged_at.is.null')
    .is('deleted_at', null)
    .limit(300);
  if (error) throw new InternalError(error);
  const rows = data ?? [];
  const emailKeys = rows
    .filter((r) => r.channel === 'email' && r.email_key)
    .map((r) => String(r.email_key));
  const waIds = rows
    .filter((r) => r.channel === 'whatsapp' && r.whatsapp_message_id)
    .map((r) => String(r.whatsapp_message_id));
  const outbox = emailKeys.length
    ? await admin
        .from('email_outbox')
        .select('idempotency_key, status, delivery_status, opened_at, clicked_at')
        .in('idempotency_key', emailKeys)
    : { data: [], error: null };
  if (outbox.error) throw new InternalError(outbox.error);
  const wa = waIds.length
    ? await admin.from('whatsapp_messages').select('id, status, read_at').in('id', waIds)
    : { data: [], error: null };
  if (wa.error) throw new InternalError(wa.error);
  const mail = new Map((outbox.data ?? []).map((o) => [String(o.idempotency_key), o]));
  const chat = new Map((wa.data ?? []).map((w) => [String(w.id), w]));
  let updated = 0;
  for (const r of rows) {
    let delivered = r.delivered === true;
    let engagedAt: string | null = r.engaged_at === null ? null : String(r.engaged_at);
    if (r.channel === 'email') {
      const o = mail.get(String(r.email_key));
      if (o) {
        delivered =
          o.status === 'sent' &&
          o.delivery_status !== 'bounced' &&
          o.delivery_status !== 'complained';
        engagedAt =
          engagedAt ??
          (o.opened_at ? String(o.opened_at) : o.clicked_at ? String(o.clicked_at) : null);
      }
    } else {
      const w = chat.get(String(r.whatsapp_message_id));
      if (w) {
        delivered = w.status === 'delivered' || w.status === 'read';
        engagedAt =
          engagedAt ?? (w.status === 'read' ? String(w.read_at ?? new Date().toISOString()) : null);
      }
    }
    if (
      delivered === (r.delivered === true) &&
      engagedAt === (r.engaged_at === null ? null : String(r.engaged_at))
    )
      continue;
    const u = await admin
      .from('messaging_messages')
      .update({ delivered, engaged_at: engagedAt })
      .eq('id', String(r.id));
    if (u.error) throw new InternalError(u.error);
    updated += 1;
  }
  return { updated };
}

/** Cron, every minute: sends due messages, puts back the ones stuck in "sending" and copies delivery and engagement. */
export async function runMessages(): Promise<{ handled: number }> {
  const admin = getAdminSupabase();
  const stuck = await admin
    .from('messaging_messages')
    .update({ status: 'queued' })
    .eq('status', 'sending')
    .lt('updated_at', new Date(Date.now() - 10 * 60_000).toISOString());
  if (stuck.error) throw new InternalError(stuck.error);
  const { data, error } = await admin.rpc('kd_claim_messages', { p_limit: MESSAGE_BATCH });
  if (error) throw new InternalError(error);
  let handled = 0;
  for (const row of (data ?? []) as Row[]) {
    try {
      await process(row);
      handled += 1;
    } catch (e) {
      log.error('message failed', { messageId: row.id, error: e });
    }
  }
  await syncEngagement();
  return { handled };
}
