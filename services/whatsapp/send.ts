// path: services/whatsapp/send.ts
// Sending WhatsApp messages. Every send checks the person's opt-in and the 24 hour window first (free text needs an open window,
// a template needs the APPROVED status), then writes the message as `queued` (the database repeats the opt-in rule), then sends
// it. A sandbox account never calls Meta: the message is recorded as delivered with a made-up id. An idempotency key makes a
// repeated request return the first message. The delivery state later comes from the status webhook.
import 'server-only';
import { ConflictError, ForbiddenError, InternalError, ValidationError } from '@/lib/errors';
import { createLogger } from '@/lib/logger';
import { sendMessage, WhatsAppApiError } from '@/lib/whatsapp/client';
import {
  buildTemplatePayload,
  buildTextPayload,
  checkSend,
  missingValues,
  renderTemplate,
  sendTemplateInput,
  sendTextInput,
} from '@/lib/whatsapp/rules';
import { getAdminSupabase } from '@/lib/supabase/admin';
import type { Actor } from '@/types/contracts';
import { mapIntegrationError } from '@/services/publicapi/db-errors';
import { ensureContact } from './contacts';
import { credentialsOf, need, record, requireAccount } from './db';
import { getTemplate } from './templates';

const log = createLogger({ service: 'whatsapp-send' });
const COLUMNS =
  'id, contact_id, direction, type, template_id, body, wa_message_id, status, error_code, error_text, origin, sandbox, sent_at, delivered_at, read_at, failed_at, received_at, created_at, whatsapp_contacts(phone_e164, profile_name)';

interface Row {
  id: string;
  contact_id: string;
  direction: string;
  type: string;
  template_id: string | null;
  body: string;
  wa_message_id: string | null;
  status: string;
  error_code: number | null;
  error_text: string | null;
  origin: string;
  sandbox: boolean;
  sent_at: string | null;
  delivered_at: string | null;
  read_at: string | null;
  failed_at: string | null;
  received_at: string | null;
  created_at: string;
  whatsapp_contacts:
    | { phone_e164: string; profile_name: string }
    | { phone_e164: string; profile_name: string }[]
    | null;
}

export interface MessageView {
  id: string;
  contactId: string;
  phone: string;
  profileName: string;
  direction: 'out' | 'in';
  type: 'text' | 'template' | 'other';
  templateId: string | null;
  body: string;
  waMessageId: string | null;
  status: 'queued' | 'sent' | 'delivered' | 'read' | 'failed' | 'received';
  errorCode: number | null;
  errorText: string | null;
  origin: string;
  sandbox: boolean;
  sentAt: string | null;
  deliveredAt: string | null;
  readAt: string | null;
  failedAt: string | null;
  receivedAt: string | null;
  createdAt: string;
}

const STATUSES = ['queued', 'sent', 'delivered', 'read', 'failed', 'received'] as const;

export const toMessageView = (r: Row): MessageView => {
  const contact = Array.isArray(r.whatsapp_contacts) ? r.whatsapp_contacts[0] : r.whatsapp_contacts;
  return {
    id: r.id,
    contactId: r.contact_id,
    phone: contact?.phone_e164 ?? '',
    profileName: contact?.profile_name ?? '',
    direction: r.direction === 'in' ? 'in' : 'out',
    type: r.type === 'template' ? 'template' : r.type === 'other' ? 'other' : 'text',
    templateId: r.template_id,
    body: r.body,
    waMessageId: r.wa_message_id,
    status: STATUSES.find((s) => s === r.status) ?? 'queued',
    errorCode: r.error_code,
    errorText: r.error_text,
    origin: r.origin,
    sandbox: r.sandbox,
    sentAt: r.sent_at,
    deliveredAt: r.delivered_at,
    readAt: r.read_at,
    failedAt: r.failed_at,
    receivedAt: r.received_at,
    createdAt: r.created_at,
  };
};

export async function listMessages(
  companyId: string,
  options: { contactId?: string; limit?: number } = {},
): Promise<MessageView[]> {
  let q = getAdminSupabase()
    .from('whatsapp_messages')
    .select(COLUMNS)
    .eq('company_id', companyId)
    .is('deleted_at', null);
  if (options.contactId) q = q.eq('contact_id', options.contactId);
  const { data, error } = await q
    .order('id', { ascending: false })
    .limit(Math.min(Math.max(options.limit ?? 50, 1), 200));
  if (error) throw new InternalError(error);
  return ((data ?? []) as unknown as Row[]).map(toMessageView);
}

async function byIdempotencyKey(companyId: string, key: string): Promise<MessageView | null> {
  const { data, error } = await getAdminSupabase()
    .from('whatsapp_messages')
    .select(COLUMNS)
    .eq('company_id', companyId)
    .eq('idempotency_key', key)
    .maybeSingle();
  if (error) throw new InternalError(error);
  return data ? toMessageView(data as unknown as Row) : null;
}

export interface Delivery {
  companyId: string;
  userId: string | null;
  to: string;
  clientId: string | null;
  kind: 'text' | 'template';
  body?: string;
  previewUrl?: boolean;
  templateId?: string;
  values?: Record<string, string>;
  origin: 'manual' | 'reply' | 'rule' | 'campaign' | 'system';
  idempotencyKey: string | null;
}

/** The common path of every outgoing message (also used by the rules and campaigns of 16.3.b). */
export async function deliver(d: Delivery): Promise<MessageView> {
  if (d.idempotencyKey) {
    const earlier = await byIdempotencyKey(d.companyId, d.idempotencyKey);
    if (earlier) return earlier;
  }
  const account = await requireAccount(d.companyId);
  if (account.status !== 'active') throw new ConflictError('WhatsApp sending is paused.');
  const contact = await ensureContact(d.companyId, d.to, { clientId: d.clientId });
  const template =
    d.kind === 'template' ? await getTemplate(d.companyId, d.templateId ?? '') : null;
  if (template) {
    const missing = missingValues(template.components, d.values ?? {});
    if (missing.length > 0)
      throw new ValidationError(`Give a value for: ${missing.map((m) => `{{${m}}}`).join(', ')}.`);
  }
  const check = checkSend({
    optStatus: contact.optStatus,
    lastInboundAt: contact.lastInboundAt,
    kind: d.kind,
    ...(template ? { templateStatus: template.status } : {}),
    now: new Date(),
  });
  if (!check.ok) throw new ForbiddenError(check.reason ?? 'This message cannot be sent.');
  const text = template ? renderTemplate(template.components, d.values ?? {}) : (d.body ?? '');
  const admin = getAdminSupabase();
  const inserted = await admin
    .from('whatsapp_messages')
    .insert({
      company_id: d.companyId,
      account_id: account.id,
      contact_id: contact.id,
      direction: 'out',
      type: d.kind,
      template_id: template?.id ?? null,
      body: text.slice(0, 4096),
      status: 'queued',
      origin: d.origin,
      idempotency_key: d.idempotencyKey,
      sandbox: account.sandbox,
      sent_by: d.userId,
    })
    .select('id')
    .single();
  if (inserted.error) {
    if (inserted.error.code === '23505' && d.idempotencyKey) {
      const earlier = await byIdempotencyKey(d.companyId, d.idempotencyKey);
      if (earlier) return earlier;
    }
    if (inserted.error.code === '42501')
      throw new ForbiddenError('This person did not agree to receive messages.');
    mapIntegrationError(inserted.error);
  }
  const id = String((inserted.data as { id: string }).id);
  const now = new Date().toISOString();
  let patch: Record<string, unknown>;
  if (account.sandbox) {
    patch = {
      status: 'delivered',
      wa_message_id: `sandbox.${crypto.randomUUID()}`,
      sent_at: now,
      delivered_at: now,
    };
  } else {
    try {
      const payload =
        template && d.kind === 'template'
          ? buildTemplatePayload(
              d.to,
              {
                name: template.name,
                language: template.language,
                parameterFormat: template.parameterFormat,
                components: template.components,
              },
              d.values ?? {},
            )
          : buildTextPayload(d.to, d.body ?? '', d.previewUrl ?? false);
      const sent = await sendMessage(await credentialsOf(account), payload);
      patch = { status: 'sent', wa_message_id: sent.messageId, sent_at: now };
    } catch (error) {
      const known = error instanceof WhatsAppApiError;
      if (!known) log.error('whatsapp send failed', { error });
      patch = {
        status: 'failed',
        failed_at: now,
        error_code: known ? error.code : null,
        error_text: (known ? error.message : 'The message could not be sent.').slice(0, 300),
      };
    }
  }
  const updated = await admin.from('whatsapp_messages').update(patch).eq('id', id);
  if (updated.error) throw new InternalError(updated.error);
  await record(
    d.companyId,
    patch.status === 'failed' ? 'whatsapp.message_failed' : 'whatsapp.message_sent',
    'whatsapp_message',
    id,
    {
      type: d.kind,
      template: template?.name ?? null,
      phoneEnding: d.to.slice(-4),
      origin: d.origin,
      sandbox: account.sandbox,
    },
  );
  const { data, error } = await admin
    .from('whatsapp_messages')
    .select(COLUMNS)
    .eq('id', id)
    .single();
  if (error) throw new InternalError(error);
  return toMessageView(data as unknown as Row);
}

export async function sendText(
  actor: Actor,
  input: unknown,
  idempotencyKey: string | null,
): Promise<MessageView> {
  const companyId = need(actor);
  const parsed = sendTextInput.safeParse(input);
  if (!parsed.success)
    throw new ValidationError(parsed.error.issues[0]?.message ?? 'The message is not valid.');
  const d = parsed.data;
  return deliver({
    companyId,
    userId: actor.userId,
    to: d.to,
    clientId: d.clientId,
    kind: 'text',
    body: d.body,
    previewUrl: d.previewUrl,
    origin: 'manual',
    idempotencyKey,
  });
}

export async function sendTemplate(
  actor: Actor,
  input: unknown,
  idempotencyKey: string | null,
): Promise<MessageView> {
  const companyId = need(actor);
  const parsed = sendTemplateInput.safeParse(input);
  if (!parsed.success)
    throw new ValidationError(parsed.error.issues[0]?.message ?? 'The message is not valid.');
  const d = parsed.data;
  return deliver({
    companyId,
    userId: actor.userId,
    to: d.to,
    clientId: d.clientId,
    kind: 'template',
    templateId: d.templateId,
    values: d.values,
    origin: 'manual',
    idempotencyKey,
  });
}
