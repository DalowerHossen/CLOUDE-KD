// path: services/whatsapp/inbound.ts
// What the platform does with an update from Meta (after the signature was checked): a message from a person is stored once
// (by its id), opens the 24 hour window and may be a stop or start word; a status update moves one of our messages forward (a
// status never goes back, failed and read are final); a template status event updates the stored template.
import 'server-only';
import { WHATSAPP_TEXT_MAX } from '@/config/s16-whatsapp';
import { InternalError } from '@/lib/errors';
import {
  isOptInText,
  isOptOutText,
  nextStatus,
  toE164,
  webhookTime,
  type OutStatus,
  type ParsedWebhook,
} from '@/lib/whatsapp/rules';
import { getAdminSupabase } from '@/lib/supabase/admin';
import type { WebhookAccount } from './accounts';
import { ensureContact, setOptStatus } from './contacts';
import { record } from './db';
import { applyTemplateUpdate } from './templates';

export interface InboundSummary {
  messages: number;
  duplicates: number;
  statuses: number;
  templates: number;
}

export async function handleWebhook(
  account: WebhookAccount,
  parsed: ParsedWebhook,
): Promise<InboundSummary> {
  const admin = getAdminSupabase();
  const now = new Date();
  const summary: InboundSummary = { messages: 0, duplicates: 0, statuses: 0, templates: 0 };

  for (const m of parsed.messages) {
    if (m.phoneNumberId !== account.phoneNumberId) continue;
    const phone = toE164(m.from);
    if (phone === null) continue;
    const at = webhookTime(m.timestamp, now);
    const contact = await ensureContact(account.companyId, phone, { profileName: m.profileName });
    const text = m.type === 'text' ? m.text.slice(0, WHATSAPP_TEXT_MAX) : '';
    const inserted = await admin.from('whatsapp_messages').insert({
      company_id: account.companyId,
      account_id: account.id,
      contact_id: contact.id,
      direction: 'in',
      type: m.type === 'text' ? 'text' : 'other',
      body: text,
      wa_message_id: m.waMessageId,
      status: 'received',
      received_at: at,
      origin: 'reply',
    });
    if (inserted.error) {
      // Meta delivers a webhook again until it is answered; the same message id is stored once.
      if (inserted.error.code === '23505') {
        summary.duplicates += 1;
        continue;
      }
      throw new InternalError(inserted.error);
    }
    summary.messages += 1;
    const open = await admin
      .from('whatsapp_contacts')
      .update({ last_inbound_at: at })
      .eq('id', contact.id)
      .or(`last_inbound_at.is.null,last_inbound_at.lt.${at}`);
    if (open.error) throw new InternalError(open.error);
    if (m.type === 'text') {
      if (isOptOutText(text))
        await setOptStatus(account.companyId, phone, 'opted_out', 'inbound keyword', {
          by: null,
          action: 'whatsapp.contact_opted_out',
        });
      else if (isOptInText(text))
        await setOptStatus(account.companyId, phone, 'opted_in', 'inbound keyword', {
          by: null,
          action: 'whatsapp.contact_opted_in',
        });
    }
  }

  for (const s of parsed.statuses) {
    if (s.phoneNumberId !== account.phoneNumberId) continue;
    const { data, error } = await admin
      .from('whatsapp_messages')
      .select('id, status, delivered_at')
      .eq('account_id', account.id)
      .eq('wa_message_id', s.waMessageId)
      .eq('direction', 'out')
      .maybeSingle();
    if (error) throw new InternalError(error);
    if (!data) continue;
    const next = nextStatus(String(data.status) as OutStatus, s.status);
    if (next === null) continue;
    const at = webhookTime(s.timestamp, now);
    const patch: Record<string, unknown> = { status: next };
    if (next === 'sent') patch.sent_at = at;
    if (next === 'delivered') patch.delivered_at = at;
    if (next === 'read') {
      patch.read_at = at;
      if (data.delivered_at === null) patch.delivered_at = at;
    }
    if (next === 'failed') {
      patch.failed_at = at;
      patch.error_code = s.errorCode;
      patch.error_text =
        s.errorText === '' ? 'WhatsApp could not deliver the message.' : s.errorText;
    }
    const upd = await admin.from('whatsapp_messages').update(patch).eq('id', String(data.id));
    if (upd.error) throw new InternalError(upd.error);
    summary.statuses += 1;
  }

  for (const t of parsed.templates) {
    if (t.wabaId !== account.wabaId) continue;
    if (await applyTemplateUpdate(account.companyId, account.id, t)) summary.templates += 1;
  }

  if (summary.messages + summary.statuses + summary.templates > 0)
    await record(account.companyId, 'whatsapp.webhook_processed', 'whatsapp_account', account.id, {
      ...summary,
    });
  return summary;
}
