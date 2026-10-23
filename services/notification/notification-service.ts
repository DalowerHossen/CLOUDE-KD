// path: services/notification/notification-service.ts
// In-app notifications (stored per person, pushed by Realtime) with preferences, mutes, a throttle and an optional
// e-mail copy or daily digest. Other STEPs call `notify`; domain events arrive through workers/notifications.
import 'server-only';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import {
  ALWAYS_ON,
  COMPANY_RECIPIENTS,
  DEFAULT_CHANNELS,
  MAX_MUTE_HOURS,
  MAX_PER_HOUR,
  NOTIFICATION_CATEGORIES,
  type NotificationCategory,
} from '@/config/notifications';
import { tryGetService } from '@/lib/container';
import { InternalError, ValidationError } from '@/lib/errors';
import { getPublicEnv } from '@/lib/env/public';
import { createLogger } from '@/lib/logger';
import { categoryOf, safeHref } from '@/lib/notifications/rules';
import { getAdminSupabase } from '@/lib/supabase/admin';
import type { NotificationInput, NotificationService } from '@/types/contracts';

const log = createLogger({ component: 'notification' });
const category = z.enum(NOTIFICATION_CATEGORIES);

export interface NotifyOptions {
  dedupeKey?: string;
  /** Overrides who in a company is told. */
  recipients?: 'owner' | 'all';
  category?: NotificationCategory;
}

interface Person {
  userId: string;
  companyId: string | null;
}

async function companyMembers(companyId: string, who: 'owner' | 'all'): Promise<Person[]> {
  let query = getAdminSupabase()
    .from('memberships')
    .select('user_id, role')
    .eq('company_id', companyId)
    .eq('status', 'active')
    .is('deleted_at', null);
  if (who === 'owner') query = query.eq('role', 'owner');
  const { data, error } = await query.limit(500);
  if (error) throw new InternalError(error);
  return (data ?? []).map((m) => ({ userId: String(m.user_id), companyId }));
}

interface PersonState {
  channels: Map<string, boolean>;
  mutedUntil: Map<string, number>;
}

async function personState(userId: string): Promise<PersonState> {
  const admin = getAdminSupabase();
  const [prefs, mutes] = await Promise.all([
    admin
      .from('notification_preferences')
      .select('category, channel, enabled')
      .eq('user_id', userId)
      .is('deleted_at', null),
    admin
      .from('notification_mutes')
      .select('category, until')
      .eq('user_id', userId)
      .is('deleted_at', null)
      .gt('until', new Date().toISOString()),
  ]);
  if (prefs.error) throw new InternalError(prefs.error);
  if (mutes.error) throw new InternalError(mutes.error);
  return {
    channels: new Map(
      (prefs.data ?? []).map((p) => [
        `${String(p.category)}:${String(p.channel)}`,
        p.enabled === true,
      ]),
    ),
    mutedUntil: new Map(
      (mutes.data ?? []).map((m) => [String(m.category), Date.parse(String(m.until))]),
    ),
  };
}

async function emailOf(userId: string): Promise<string | null> {
  const { data } = await getAdminSupabase()
    .from('profiles')
    .select('email')
    .eq('user_id', userId)
    .is('deleted_at', null)
    .maybeSingle();
  return data?.email ? String(data.email) : null;
}

async function deliver(
  person: Person,
  cat: NotificationCategory,
  input: { type: string; title: string; body: string; href: string | null },
  dedupeKey: string | null,
): Promise<{ stored: boolean; emailed: boolean }> {
  const state = await personState(person.userId);
  const forced = ALWAYS_ON.includes(cat);
  const muted = !forced && (state.mutedUntil.get(cat) ?? 0) > Date.now();
  const defaults = DEFAULT_CHANNELS[cat];
  const inApp = forced || (!muted && (state.channels.get(`${cat}:in_app`) ?? defaults.in_app));
  const email = !muted && (state.channels.get(`${cat}:email`) ?? defaults.email);
  let stored = false;
  let emailed = false;
  if (inApp) {
    const { data, error } = await getAdminSupabase().rpc('kd_notify_insert', {
      p_company: person.companyId,
      p_user: person.userId,
      p_category: cat,
      p_type: input.type,
      p_title: input.title,
      p_body: input.body,
      p_href: input.href,
      p_dedupe: dedupeKey,
      p_max_per_hour: forced ? 1_000_000 : MAX_PER_HOUR,
    });
    if (error) throw new InternalError(error);
    stored = typeof data === 'string';
    // A repeat or a throttled notification is not mailed either.
    if (!stored) return { stored: false, emailed: false };
  }
  if (email) {
    const to = await emailOf(person.userId);
    const service = tryGetService('email');
    if (to && service) {
      const base = getPublicEnv().NEXT_PUBLIC_APP_URL.replace(/\/+$/, '');
      try {
        await service.send({
          template: 'notification.generic',
          to,
          data: {
            title: input.title,
            body: input.body,
            link: input.href ? `${base}${input.href}` : '',
          },
          companyId: person.companyId,
          idempotencyKey: `notify:${person.userId}:${dedupeKey ?? randomUUID()}`,
        });
        emailed = true;
      } catch (error) {
        log.warn('notification e-mail failed', {
          error: error instanceof Error ? error.message : 'failed',
        });
      }
    }
  }
  return { stored, emailed };
}

export async function notifyExtended(
  input: NotificationInput,
  options: NotifyOptions = {},
): Promise<number> {
  const cat = options.category ?? categoryOf(input.type);
  const href = safeHref(input.href);
  const people: Person[] = [];
  if (input.userId) {
    people.push({ userId: input.userId, companyId: input.companyId ?? null });
  } else if (input.companyId) {
    people.push(
      ...(await companyMembers(input.companyId, options.recipients ?? COMPANY_RECIPIENTS[cat])),
    );
  } else {
    throw new ValidationError('A notification needs a person or a company.');
  }
  let count = 0;
  for (const person of people) {
    try {
      const result = await deliver(
        person,
        cat,
        { type: input.type, title: input.title, body: input.body, href },
        options.dedupeKey ?? null,
      );
      if (result.stored || result.emailed) count += 1;
    } catch (error) {
      // One person's problem never stops the others.
      log.error('notification could not be delivered', { error });
    }
  }
  return count;
}

export function createNotificationService(): NotificationService {
  return { notify: async (input) => void (await notifyExtended(input)) };
}

export interface NotificationItem {
  id: string;
  category: string;
  type: string;
  title: string;
  body: string;
  href: string | null;
  read: boolean;
  createdAt: string;
}

export async function listNotifications(
  userId: string,
  filter: {
    unreadOnly?: boolean;
    category?: NotificationCategory;
    limit?: number;
    before?: string;
  } = {},
): Promise<{ items: NotificationItem[]; unread: number }> {
  const admin = getAdminSupabase();
  let query = admin
    .from('notifications')
    .select('id, category, type, title, body, href, read_at, created_at')
    .eq('user_id', userId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(Math.min(filter.limit ?? 30, 100));
  if (filter.unreadOnly) query = query.is('read_at', null);
  if (filter.category) query = query.eq('category', filter.category);
  if (filter.before) query = query.lt('created_at', filter.before);
  const [rows, unread] = await Promise.all([
    query,
    admin
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .is('deleted_at', null)
      .is('read_at', null),
  ]);
  if (rows.error) throw new InternalError(rows.error);
  if (unread.error) throw new InternalError(unread.error);
  return {
    items: (rows.data ?? []).map((r) => ({
      id: String(r.id),
      category: String(r.category),
      type: String(r.type),
      title: String(r.title),
      body: String(r.body),
      href: r.href ? String(r.href) : null,
      read: r.read_at !== null,
      createdAt: String(r.created_at),
    })),
    unread: unread.count ?? 0,
  };
}

export async function markRead(userId: string, ids: string[] | null): Promise<number> {
  const { data, error } = await getAdminSupabase().rpc('kd_notification_mark_read', {
    p_user: userId,
    p_ids: ids,
  });
  if (error) throw new InternalError(error);
  return z.coerce.number().parse(data ?? 0);
}

export interface PreferenceView {
  rows: {
    category: NotificationCategory;
    inApp: boolean;
    email: boolean;
    alwaysOn: boolean;
    mutedUntil: string | null;
  }[];
  dailyDigest: boolean;
}

export async function preferences(userId: string): Promise<PreferenceView> {
  const state = await personState(userId);
  const { data } = await getAdminSupabase()
    .from('notification_settings')
    .select('daily_digest')
    .eq('user_id', userId)
    .is('deleted_at', null)
    .maybeSingle();
  return {
    rows: NOTIFICATION_CATEGORIES.map((c) => ({
      category: c,
      inApp:
        ALWAYS_ON.includes(c) || (state.channels.get(`${c}:in_app`) ?? DEFAULT_CHANNELS[c].in_app),
      email: state.channels.get(`${c}:email`) ?? DEFAULT_CHANNELS[c].email,
      alwaysOn: ALWAYS_ON.includes(c),
      mutedUntil:
        (state.mutedUntil.get(c) ?? 0) > Date.now()
          ? new Date(state.mutedUntil.get(c) ?? 0).toISOString()
          : null,
    })),
    dailyDigest: data?.daily_digest === true,
  };
}

export const preferenceActionSchema = z.discriminatedUnion('action', [
  z
    .object({
      action: z.literal('set_channel'),
      category,
      channel: z.enum(['in_app', 'email']),
      enabled: z.boolean(),
    })
    .strict(),
  z
    .object({
      action: z.literal('mute'),
      category,
      hours: z.number().int().min(1).max(MAX_MUTE_HOURS),
    })
    .strict(),
  z.object({ action: z.literal('unmute'), category }).strict(),
  z.object({ action: z.literal('digest'), enabled: z.boolean() }).strict(),
  z
    .object({
      action: z.literal('bulk'),
      enabled: z.boolean(),
      channel: z.enum(['in_app', 'email']),
    })
    .strict(),
  z.object({ action: z.literal('test') }).strict(),
]);
export type PreferenceAction = z.infer<typeof preferenceActionSchema>;

export async function applyPreference(
  userId: string,
  companyId: string | null,
  input: PreferenceAction,
): Promise<void> {
  const admin = getAdminSupabase();
  const upsertChannel = async (
    c: NotificationCategory,
    channel: 'in_app' | 'email',
    enabled: boolean,
  ): Promise<void> => {
    if (c === 'security' && channel === 'in_app' && !enabled)
      throw new ValidationError('Security notices cannot be switched off in the app.');
    const existing = await admin
      .from('notification_preferences')
      .select('id')
      .eq('user_id', userId)
      .eq('category', c)
      .eq('channel', channel)
      .is('deleted_at', null)
      .maybeSingle();
    if (existing.error) throw new InternalError(existing.error);
    const result = existing.data
      ? await admin
          .from('notification_preferences')
          .update({ enabled })
          .eq('id', String(existing.data.id))
      : await admin
          .from('notification_preferences')
          .insert({ company_id: companyId, user_id: userId, category: c, channel, enabled });
    if (result.error) throw new InternalError(result.error);
  };
  switch (input.action) {
    case 'set_channel':
      await upsertChannel(input.category, input.channel, input.enabled);
      return;
    case 'bulk':
      for (const c of NOTIFICATION_CATEGORIES) {
        if (c === 'security' && input.channel === 'in_app') continue;
        await upsertChannel(c, input.channel, input.enabled);
      }
      return;
    case 'mute': {
      if (ALWAYS_ON.includes(input.category))
        throw new ValidationError('Security notices cannot be muted.');
      const until = new Date(Date.now() + input.hours * 3_600_000).toISOString();
      const existing = await admin
        .from('notification_mutes')
        .select('id')
        .eq('user_id', userId)
        .eq('category', input.category)
        .is('deleted_at', null)
        .maybeSingle();
      const result = existing.data
        ? await admin
            .from('notification_mutes')
            .update({ until })
            .eq('id', String(existing.data.id))
        : await admin
            .from('notification_mutes')
            .insert({ company_id: companyId, user_id: userId, category: input.category, until });
      if (result.error) throw new InternalError(result.error);
      return;
    }
    case 'unmute': {
      const { error } = await admin
        .from('notification_mutes')
        .update({ deleted_at: new Date().toISOString() })
        .eq('user_id', userId)
        .eq('category', input.category)
        .is('deleted_at', null);
      if (error) throw new InternalError(error);
      return;
    }
    case 'digest': {
      const existing = await admin
        .from('notification_settings')
        .select('id')
        .eq('user_id', userId)
        .is('deleted_at', null)
        .maybeSingle();
      const result = existing.data
        ? await admin
            .from('notification_settings')
            .update({ daily_digest: input.enabled })
            .eq('id', String(existing.data.id))
        : await admin
            .from('notification_settings')
            .insert({ company_id: companyId, user_id: userId, daily_digest: input.enabled });
      if (result.error) throw new InternalError(result.error);
      return;
    }
    case 'test':
      // A preview before saving (feature 682): a real notification to the person, with the current settings.
      await notifyExtended(
        {
          userId,
          companyId: companyId ?? undefined,
          type: 'system.test',
          title: 'Test notification',
          body: 'This is how a notification looks with your current settings.',
          href: '/notifications',
        },
        { dedupeKey: `test:${userId}:${Date.now()}`, category: 'system' },
      );
      return;
  }
}

/** Daily digest: one e-mail per person who switched it on, with the unread notifications of the last 24 hours. */
export async function sendDigests(): Promise<number> {
  const admin = getAdminSupabase();
  const email = tryGetService('email');
  if (!email) return 0;
  const { data, error } = await admin
    .from('notification_settings')
    .select('id, user_id, company_id, last_digest_at')
    .eq('daily_digest', true)
    .is('deleted_at', null)
    .limit(2000);
  if (error) throw new InternalError(error);
  let sent = 0;
  const since = new Date(Date.now() - 24 * 3_600_000).toISOString();
  for (const s of data ?? []) {
    if (s.last_digest_at && Date.parse(String(s.last_digest_at)) > Date.now() - 20 * 3_600_000)
      continue;
    const items = await admin
      .from('notifications')
      .select('title, body')
      .eq('user_id', String(s.user_id))
      .is('deleted_at', null)
      .is('read_at', null)
      .gt('created_at', since)
      .order('created_at', { ascending: false })
      .limit(50);
    if (items.error || !items.data || items.data.length === 0) continue;
    const to = await emailOf(String(s.user_id));
    if (!to) continue;
    const summary = items.data
      .map((i) => `- ${String(i.title)}${i.body ? `: ${String(i.body)}` : ''}`)
      .join('\n');
    try {
      await email.send({
        template: 'digest.daily',
        to,
        data: { summary },
        companyId: s.company_id ? String(s.company_id) : null,
        idempotencyKey: `digest:${String(s.user_id)}:${new Date().toISOString().slice(0, 10)}`,
      });
      await admin
        .from('notification_settings')
        .update({ last_digest_at: new Date().toISOString() })
        .eq('id', String(s.id));
      sent += 1;
    } catch (e) {
      log.warn('digest could not be sent', { error: e instanceof Error ? e.message : 'failed' });
    }
  }
  return sent;
}
