// path: services/messaging/preferences.ts
// Settings, routes and client preferences of messaging: quiet hours and the cost of a message, the channels tried for each kind of
// message, and the channel a client likes best or does not want.
import 'server-only';
import { MAX_ROUTES, type MessagingChannel } from '@/config/s16-messaging';
import { ConflictError, InternalError, NotFoundError, ValidationError } from '@/lib/errors';
import { prefsInput, routeInput, settingsInput } from '@/lib/messaging/rules';
import { getAdminSupabase } from '@/lib/supabase/admin';
import type { Actor } from '@/types/contracts';
import { mapIntegrationError } from '@/services/publicapi/db-errors';
import { getSettings, loadTarget, need, record, type MessagingSettings } from './db';

export async function saveSettings(actor: Actor, input: unknown): Promise<MessagingSettings> {
  const companyId = need(actor);
  const parsed = settingsInput.safeParse(input);
  if (!parsed.success)
    throw new ValidationError(parsed.error.issues[0]?.message ?? 'The settings are not valid.');
  const d = parsed.data;
  const row = {
    quiet_enabled: d.quietEnabled,
    quiet_start: d.quietStart,
    quiet_end: d.quietEnd,
    timezone: d.timezone,
    email_cost: d.emailCost,
    whatsapp_cost: d.whatsappCost,
    ab_min_sample: d.abMinSample,
  };
  const current = await getSettings(companyId);
  const admin = getAdminSupabase();
  if (current.version === null) {
    const { error } = await admin
      .from('messaging_settings')
      .insert({ company_id: companyId, ...row });
    if (error) mapIntegrationError(error);
  } else {
    const { data, error } = await admin
      .from('messaging_settings')
      .update(row)
      .eq('company_id', companyId)
      .eq('version', current.version)
      .is('deleted_at', null)
      .select('id');
    if (error) mapIntegrationError(error);
    if ((data ?? []).length === 0)
      throw new ConflictError('The settings changed. Reload and try again.');
  }
  await record(companyId, 'messaging.settings_changed', 'messaging_settings', null, {
    quiet: d.quietEnabled,
    timezone: d.timezone,
  });
  return getSettings(companyId);
}

export interface RouteView {
  id: string;
  kind: string;
  channels: MessagingChannel[];
  enabled: boolean;
  version: number;
}

const toChannels = (v: unknown): MessagingChannel[] =>
  (Array.isArray(v) ? v : []).filter(
    (c): c is MessagingChannel => c === 'email' || c === 'whatsapp',
  );

export async function listRoutes(companyId: string): Promise<RouteView[]> {
  const { data, error } = await getAdminSupabase()
    .from('messaging_routes')
    .select('id, kind, channels, enabled, version')
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .order('kind', { ascending: true })
    .limit(MAX_ROUTES);
  if (error) throw new InternalError(error);
  return (data ?? []).map((r) => ({
    id: String(r.id),
    kind: String(r.kind),
    channels: toChannels(r.channels),
    enabled: r.enabled === true,
    version: Number(r.version),
  }));
}

/** Sets the channels of one kind of message (made or changed). */
export async function saveRoute(actor: Actor, input: unknown): Promise<RouteView[]> {
  const companyId = need(actor);
  const parsed = routeInput.safeParse(input);
  if (!parsed.success)
    throw new ValidationError(parsed.error.issues[0]?.message ?? 'The route is not valid.');
  const d = parsed.data;
  const existing = (await listRoutes(companyId)).find((r) => r.kind === d.kind);
  const admin = getAdminSupabase();
  if (existing) {
    const { data, error } = await admin
      .from('messaging_routes')
      .update({ channels: d.channels, enabled: d.enabled })
      .eq('id', existing.id)
      .eq('version', existing.version)
      .select('id');
    if (error) mapIntegrationError(error);
    if ((data ?? []).length === 0)
      throw new ConflictError('The route changed. Reload and try again.');
  } else {
    if ((await listRoutes(companyId)).length >= MAX_ROUTES)
      throw new ConflictError(`A company can have ${MAX_ROUTES} routes at most.`);
    const { error } = await admin
      .from('messaging_routes')
      .insert({ company_id: companyId, kind: d.kind, channels: d.channels, enabled: d.enabled });
    if (error) mapIntegrationError(error);
  }
  await record(companyId, 'messaging.route_saved', 'messaging_route', null, {
    kind: d.kind,
    channels: d.channels,
  });
  return listRoutes(companyId);
}

export async function deleteRoute(actor: Actor, id: string): Promise<void> {
  const companyId = need(actor);
  const found = (await listRoutes(companyId)).find((r) => r.id === id);
  if (!found) throw new NotFoundError();
  const { error } = await getAdminSupabase()
    .from('messaging_routes')
    .update({ deleted_at: new Date().toISOString() })
    .eq('company_id', companyId)
    .eq('id', id);
  if (error) mapIntegrationError(error);
  await record(companyId, 'messaging.route_removed', 'messaging_route', id, { kind: found.kind });
}

export interface PrefsView {
  preferred: MessagingChannel | null;
  blocked: MessagingChannel[];
}

export async function getPrefs(companyId: string, clientId: string): Promise<PrefsView> {
  const { data, error } = await getAdminSupabase()
    .from('messaging_client_prefs')
    .select('preferred, blocked')
    .eq('company_id', companyId)
    .eq('client_id', clientId)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw new InternalError(error);
  const preferred = toChannels([data?.preferred])[0] ?? null;
  return { preferred, blocked: toChannels(data?.blocked) };
}

export async function savePrefs(
  actor: Actor,
  clientId: string,
  input: unknown,
): Promise<PrefsView> {
  const companyId = need(actor);
  const parsed = prefsInput.safeParse(input);
  if (!parsed.success)
    throw new ValidationError(parsed.error.issues[0]?.message ?? 'The preference is not valid.');
  if ((await loadTarget(companyId, clientId)) === null) throw new NotFoundError();
  const d = parsed.data;
  const admin = getAdminSupabase();
  const existing = await admin
    .from('messaging_client_prefs')
    .select('id')
    .eq('company_id', companyId)
    .eq('client_id', clientId)
    .is('deleted_at', null)
    .maybeSingle();
  if (existing.error) throw new InternalError(existing.error);
  const row = { preferred: d.preferred, blocked: d.blocked };
  const r = existing.data
    ? await admin.from('messaging_client_prefs').update(row).eq('id', String(existing.data.id))
    : await admin
        .from('messaging_client_prefs')
        .insert({ company_id: companyId, client_id: clientId, ...row });
  if (r.error) mapIntegrationError(r.error);
  await record(companyId, 'messaging.prefs_saved', 'messaging_client_prefs', clientId, {
    preferred: d.preferred,
    blocked: d.blocked,
  });
  return getPrefs(companyId, clientId);
}
