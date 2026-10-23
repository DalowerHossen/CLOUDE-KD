// path: services/whatsapp/contacts.ts
// People the company may message, with their opt-in state. A person is `unknown` until someone records a decision: the owner
// (opt-in with its source, for example a form or a signed paper) or the person (a stop or start word). The database refuses a
// message to someone who opted out. Decisions are also written to the platform consent log on a best-effort basis; this table
// is the source of truth for sending.
import 'server-only';
import { tryGetService } from '@/lib/container';
import { InternalError, NotFoundError, ValidationError } from '@/lib/errors';
import { createLogger } from '@/lib/logger';
import { toE164 } from '@/lib/whatsapp/rules';
import { getAdminSupabase } from '@/lib/supabase/admin';
import type { Actor } from '@/types/contracts';
import { mapIntegrationError } from '@/services/publicapi/db-errors';
import { need, record } from './db';

const log = createLogger({ service: 'whatsapp-contacts' });
const COLUMNS =
  'id, phone_e164, profile_name, client_id, opt_status, opt_source, opt_changed_at, last_inbound_at, version';

interface Row {
  id: string;
  phone_e164: string;
  profile_name: string;
  client_id: string | null;
  opt_status: string;
  opt_source: string;
  opt_changed_at: string | null;
  last_inbound_at: string | null;
  version: number;
}

export interface ContactView {
  id: string;
  phone: string;
  profileName: string;
  clientId: string | null;
  optStatus: 'opted_in' | 'opted_out' | 'unknown';
  optSource: string;
  optChangedAt: string | null;
  lastInboundAt: string | null;
  version: number;
}

export const toContactView = (r: Row): ContactView => ({
  id: r.id,
  phone: r.phone_e164,
  profileName: r.profile_name,
  clientId: r.client_id,
  optStatus:
    r.opt_status === 'opted_in'
      ? 'opted_in'
      : r.opt_status === 'opted_out'
        ? 'opted_out'
        : 'unknown',
  optSource: r.opt_source,
  optChangedAt: r.opt_changed_at,
  lastInboundAt: r.last_inbound_at,
  version: r.version,
});

export async function listContacts(companyId: string, limit = 100): Promise<ContactView[]> {
  const { data, error } = await getAdminSupabase()
    .from('whatsapp_contacts')
    .select(COLUMNS)
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .order('updated_at', { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 500));
  if (error) throw new InternalError(error);
  return ((data ?? []) as unknown as Row[]).map(toContactView);
}

/** The contact for a number, made when it does not exist yet. `clientId` links it to a client when given. */
export async function ensureContact(
  companyId: string,
  phone: string,
  extra: { profileName?: string; clientId?: string | null } = {},
): Promise<ContactView> {
  const admin = getAdminSupabase();
  const found = await admin
    .from('whatsapp_contacts')
    .select(COLUMNS)
    .eq('company_id', companyId)
    .eq('phone_e164', phone)
    .is('deleted_at', null)
    .maybeSingle();
  if (found.error) throw new InternalError(found.error);
  if (found.data) {
    const row = found.data as unknown as Row;
    const patch: Record<string, unknown> = {};
    if (extra.profileName && row.profile_name === '')
      patch.profile_name = extra.profileName.slice(0, 200);
    if (extra.clientId && row.client_id === null) patch.client_id = extra.clientId;
    if (Object.keys(patch).length > 0) {
      const upd = await admin.from('whatsapp_contacts').update(patch).eq('id', row.id);
      if (upd.error) throw new InternalError(upd.error);
    }
    return toContactView({
      ...row,
      ...('profile_name' in patch ? { profile_name: String(patch.profile_name) } : {}),
    });
  }
  const made = await admin
    .from('whatsapp_contacts')
    .insert({
      company_id: companyId,
      phone_e164: phone,
      profile_name: (extra.profileName ?? '').slice(0, 200),
      client_id: extra.clientId ?? null,
    })
    .select(COLUMNS)
    .single();
  if (made.error) {
    // Two requests made the same contact at once: read the one that won.
    if (made.error.code === '23505') return ensureContact(companyId, phone, extra);
    mapIntegrationError(made.error);
  }
  return toContactView(made.data as unknown as Row);
}

async function mirrorConsent(
  companyId: string,
  phone: string,
  status: 'opted_in' | 'opted_out',
): Promise<void> {
  const consent = tryGetService('consent');
  if (!consent) return;
  try {
    if (status === 'opted_in')
      await consent.record({
        subject: phone,
        purpose: 'whatsapp',
        version: '1',
        text: 'The person agreed to receive WhatsApp messages from the company.',
      });
    else await consent.withdraw(phone, 'whatsapp');
  } catch (error) {
    log.warn('consent log write failed', { companyId, error });
  }
}

/** Records a decision about messages for a number. Used by the owner (with a source) and by the stop and start words. */
export async function setOptStatus(
  companyId: string,
  phone: string,
  status: 'opted_in' | 'opted_out',
  source: string,
  audit: { by: string | null; action: string },
): Promise<ContactView> {
  const contact = await ensureContact(companyId, phone);
  if (contact.optStatus === status && contact.optSource === source) return contact;
  const { error } = await getAdminSupabase()
    .from('whatsapp_contacts')
    .update({
      opt_status: status,
      opt_source: source.slice(0, 60),
      opt_changed_at: new Date().toISOString(),
    })
    .eq('company_id', companyId)
    .eq('id', contact.id);
  if (error) mapIntegrationError(error);
  await mirrorConsent(companyId, phone, status);
  await record(companyId, audit.action, 'whatsapp_contact', contact.id, {
    status,
    source,
    phoneEnding: phone.slice(-4),
    by: audit.by,
  });
  const fresh = await getContact(companyId, contact.id);
  return fresh;
}

export async function getContact(companyId: string, id: string): Promise<ContactView> {
  const { data, error } = await getAdminSupabase()
    .from('whatsapp_contacts')
    .select(COLUMNS)
    .eq('company_id', companyId)
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw new InternalError(error);
  if (!data) throw new NotFoundError();
  return toContactView(data as unknown as Row);
}

/** The owner records a decision, with where it came from (for example "web form" or "signed paper"). */
export async function recordDecision(
  actor: Actor,
  input: { phone: string; status: 'opted_in' | 'opted_out'; source: string },
): Promise<ContactView> {
  const companyId = need(actor);
  const phone = toE164(input.phone);
  if (phone === null)
    throw new ValidationError('Enter the number with its country code, for example +16505551234.');
  const source = input.source.trim();
  if (input.status === 'opted_in' && source.length < 3)
    throw new ValidationError('Say where the person agreed, for example "web form".');
  return setOptStatus(companyId, phone, input.status, source || 'owner', {
    by: actor.userId,
    action:
      input.status === 'opted_in' ? 'whatsapp.contact_opted_in' : 'whatsapp.contact_opted_out',
  });
}
