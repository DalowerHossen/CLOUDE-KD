// path: services/messaging/db.ts
// Shared helpers of the messaging services: the company of an actor, the audit entry, the settings and the way a client can be reached.
import 'server-only';
import { getService } from '@/lib/container';
import { InternalError, ValidationError } from '@/lib/errors';
import { getAdminSupabase } from '@/lib/supabase/admin';
import type { Quiet } from '@/lib/messaging/rules';
import type { Actor } from '@/types/contracts';

export const need = (actor: Actor): string => {
  if (!actor.companyId) throw new ValidationError('A company is needed.');
  return actor.companyId;
};

export async function record(
  companyId: string,
  action: string,
  type: string,
  id: string | null,
  metadata: Record<string, unknown>,
): Promise<void> {
  await getService('audit').record({
    action,
    resourceType: type,
    resourceId: id,
    companyId,
    metadata,
  });
}

export interface MessagingSettings {
  quiet: Quiet;
  emailCost: string;
  whatsappCost: string;
  abMinSample: number;
  version: number | null;
}

export const DEFAULT_SETTINGS: MessagingSettings = {
  quiet: { enabled: false, start: '22:00', end: '08:00', timezone: 'UTC' },
  emailCost: '0.0000',
  whatsappCost: '0.0000',
  abMinSample: 20,
  version: null,
};

export async function getSettings(companyId: string): Promise<MessagingSettings> {
  const { data, error } = await getAdminSupabase()
    .from('messaging_settings')
    .select(
      'quiet_enabled, quiet_start, quiet_end, timezone, email_cost, whatsapp_cost, ab_min_sample, version',
    )
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw new InternalError(error);
  if (!data) return DEFAULT_SETTINGS;
  return {
    quiet: {
      enabled: data.quiet_enabled === true,
      start: String(data.quiet_start),
      end: String(data.quiet_end),
      timezone: String(data.timezone),
    },
    emailCost: String(data.email_cost),
    whatsappCost: String(data.whatsapp_cost),
    abMinSample: Number(data.ab_min_sample),
    version: Number(data.version),
  };
}

export interface Target {
  clientId: string;
  name: string;
  contactName: string;
  email: string | null;
  phone: string | null;
  doNotContact: boolean;
}

/** How a client can be reached. Null when the client does not exist in this company. */
export async function loadTarget(companyId: string, clientId: string): Promise<Target | null> {
  const { data, error } = await getAdminSupabase()
    .from('clients')
    .select('id, name, contact_name, email, billing_email, phone, do_not_contact')
    .eq('company_id', companyId)
    .eq('id', clientId)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw new InternalError(error);
  if (!data) return null;
  const email = data.billing_email ?? data.email;
  const clean = (v: unknown): string | null =>
    typeof v === 'string' && v.trim() !== '' ? v.trim() : null;
  return {
    clientId: String(data.id),
    name: String(data.name),
    contactName: String(data.contact_name ?? ''),
    email: clean(email),
    phone: clean(data.phone),
    doNotContact: data.do_not_contact === true,
  };
}
