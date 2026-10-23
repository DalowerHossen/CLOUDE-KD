// path: services/messaging/channels.ts
// The two channels. Each one decides for itself whether it may send to this client and, if it may, sends through the existing
// service of its kind (the e-mail service with its queue and suppression list; the WhatsApp delivery path with its opt-in, 24 hour
// window and approved-template rules), so the rules of a channel are never bypassed here. A refusal is a "skipped" attempt with the
// reason, so the next channel can be tried; a real error is a "failed" attempt.
import 'server-only';
import { EMAIL_TEMPLATE_ID, type MessagingChannel } from '@/config/s16-messaging';
import { getService, tryGetService } from '@/lib/container';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '@/lib/errors';
import { createLogger } from '@/lib/logger';
import { renderClientText } from '@/lib/messaging/rules';
import { toE164 } from '@/lib/whatsapp/rules';
import { fillValues } from '@/lib/whatsapp/automation-rules';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { deliver } from '@/services/whatsapp/send';
import type { Target } from './db';

const log = createLogger({ service: 'messaging-channels' });

export interface Outgoing {
  id: string;
  companyId: string;
  kind: 'notice' | 'campaign';
  subject: string;
  body: string;
  whatsappTemplateId: string | null;
  whatsappValues: Record<string, string>;
  createdBy: string | null;
}

export interface Attempt {
  channel: MessagingChannel;
  result: 'sent' | 'skipped' | 'failed';
  reason: string | null;
  /** The key of the e-mail in the outbox, or the id of the WhatsApp message. */
  ref: string | null;
}

const skipped = (channel: MessagingChannel, reason: string): Attempt => ({
  channel,
  result: 'skipped',
  reason,
  ref: null,
});

async function trySendEmail(msg: Outgoing, target: Target): Promise<Attempt> {
  if (target.email === null) return skipped('email', 'The client has no e-mail address.');
  const to = target.email.toLowerCase();
  const suppressed = await getAdminSupabase()
    .from('email_suppressions')
    .select('id')
    .eq('email', to)
    .or(`company_id.is.null,company_id.eq.${msg.companyId}`)
    .is('deleted_at', null)
    .limit(1);
  if (suppressed.error)
    return {
      channel: 'email',
      result: 'failed',
      reason: 'The suppression list could not be read.',
      ref: null,
    };
  if ((suppressed.data ?? []).length > 0)
    return skipped('email', 'The address is on the suppression list.');
  if (msg.kind === 'campaign') {
    const consent = tryGetService('consent');
    if (!consent || !(await consent.has(to, 'email_marketing')))
      return skipped('email', 'There is no consent to marketing e-mail for this address.');
  }
  const key = `msg:${msg.id}:email`;
  try {
    await getService('email').send({
      template: EMAIL_TEMPLATE_ID,
      to,
      data: {
        subject: renderClientText(msg.subject, target),
        body: renderClientText(msg.body, target),
      },
      companyId: msg.companyId,
      idempotencyKey: key,
    });
    return { channel: 'email', result: 'sent', reason: null, ref: key };
  } catch (e) {
    log.warn('email channel failed', { messageId: msg.id, error: e });
    return {
      channel: 'email',
      result: 'failed',
      reason: 'The e-mail could not be sent.',
      ref: null,
    };
  }
}

async function trySendWhatsapp(msg: Outgoing, target: Target): Promise<Attempt> {
  if (target.phone === null) return skipped('whatsapp', 'The client has no phone number.');
  const phone = toE164(target.phone);
  if (phone === null) return skipped('whatsapp', 'The phone number is not valid.');
  const filled = fillValues(msg.whatsappValues, {
    'client.name': target.name,
    'client.contact_name': target.contactName === '' ? target.name : target.contactName,
  });
  try {
    const sent = await deliver({
      companyId: msg.companyId,
      userId: msg.createdBy,
      to: phone,
      clientId: target.clientId,
      kind: msg.whatsappTemplateId ? 'template' : 'text',
      ...(msg.whatsappTemplateId
        ? { templateId: msg.whatsappTemplateId, values: filled.values }
        : { body: renderClientText(msg.body, target) }),
      origin: msg.kind === 'campaign' ? 'campaign' : 'system',
      idempotencyKey: `msg:${msg.id}:wa`,
    });
    return { channel: 'whatsapp', result: 'sent', reason: null, ref: sent.id };
  } catch (e) {
    // The WhatsApp rules (opt-in, window, approved template, paused account) answer with these errors: they are refusals.
    if (
      e instanceof ForbiddenError ||
      e instanceof ConflictError ||
      e instanceof ValidationError ||
      e instanceof NotFoundError
    )
      return skipped('whatsapp', e.message.slice(0, 200));
    log.warn('whatsapp channel failed', { messageId: msg.id, error: e });
    return {
      channel: 'whatsapp',
      result: 'failed',
      reason: 'The WhatsApp message could not be sent.',
      ref: null,
    };
  }
}

export function trySend(
  channel: MessagingChannel,
  msg: Outgoing,
  target: Target,
): Promise<Attempt> {
  return channel === 'email' ? trySendEmail(msg, target) : trySendWhatsapp(msg, target);
}
