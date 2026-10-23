// path: services/social/schedules.ts
// Recurring posting schedules: pick days of the week and a time in a time zone, and a post is made for each coming slot (14 days
// ahead, made again every day by the cron job, each slot only once). A schedule that is switched off, changed or removed cancels the
// posts it made that have not gone out. The posts then follow the normal path: approval where it is asked for, then publishing.
import 'server-only';
import { MAX_SCHEDULES_PER_COMPANY, SCHEDULE_HORIZON_DAYS } from '@/config/s16-social';
import { ConflictError, InternalError, NotFoundError, ValidationError } from '@/lib/errors';
import { createLogger } from '@/lib/logger';
import { withHashtags } from '@/lib/social/rules';
import { scheduleInput, scheduleUpdate, slotsFor } from '@/lib/social/schedule';
import { getAdminSupabase } from '@/lib/supabase/admin';
import type { Actor } from '@/types/contracts';
import { mapIntegrationError } from '@/services/publicapi/db-errors';
import { getAccount } from './accounts';
import { need, record } from './db';
import { getGroup } from './hashtags';
import { makePost } from './make-post';

const log = createLogger({ service: 'social-schedules' });
const COLUMNS =
  'id, company_id, account_id, name, body, link_url, image_url, hashtag_group_id, days_of_week, time_of_day, timezone, enabled, version, created_by, social_accounts(display_name, status)';

interface Row {
  id: string;
  company_id: string;
  account_id: string;
  name: string;
  body: string;
  link_url: string | null;
  image_url: string | null;
  hashtag_group_id: string | null;
  days_of_week: number[];
  time_of_day: string;
  timezone: string;
  enabled: boolean;
  version: number;
  created_by: string | null;
  social_accounts:
    { display_name: string; status: string } | { display_name: string; status: string }[] | null;
}

export interface ScheduleView {
  id: string;
  accountId: string;
  accountName: string;
  name: string;
  body: string;
  linkUrl: string | null;
  imageUrl: string | null;
  hashtagGroupId: string | null;
  daysOfWeek: number[];
  timeOfDay: string;
  timezone: string;
  enabled: boolean;
  version: number;
}

const toView = (r: Row): ScheduleView => {
  const a = Array.isArray(r.social_accounts) ? r.social_accounts[0] : r.social_accounts;
  return {
    id: r.id,
    accountId: r.account_id,
    accountName: a?.display_name ?? '',
    name: r.name,
    body: r.body,
    linkUrl: r.link_url,
    imageUrl: r.image_url,
    hashtagGroupId: r.hashtag_group_id,
    daysOfWeek: [...r.days_of_week].sort((x, y) => x - y),
    timeOfDay: r.time_of_day,
    timezone: r.timezone,
    enabled: r.enabled,
    version: r.version,
  };
};

export async function listSchedules(companyId: string): Promise<ScheduleView[]> {
  const { data, error } = await getAdminSupabase()
    .from('social_schedules')
    .select(COLUMNS)
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(MAX_SCHEDULES_PER_COMPANY);
  if (error) throw new InternalError(error);
  return ((data ?? []) as unknown as Row[]).map(toView);
}

async function rowOf(companyId: string, id: string): Promise<Row> {
  const { data, error } = await getAdminSupabase()
    .from('social_schedules')
    .select(COLUMNS)
    .eq('company_id', companyId)
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw new InternalError(error);
  if (!data) throw new NotFoundError();
  return data as unknown as Row;
}

/** Cancels the posts of a schedule that have not gone out, and frees their slots so they can be made again. */
async function cancelFuture(scheduleId: string): Promise<number> {
  const { data, error } = await getAdminSupabase()
    .from('social_posts')
    .update({ status: 'cancelled', schedule_id: null, schedule_slot: null })
    .eq('schedule_id', scheduleId)
    .eq('status', 'scheduled')
    .gt('scheduled_at', new Date().toISOString())
    .select('id');
  if (error) throw new InternalError(error);
  return (data ?? []).length;
}

/** Makes the posts for the coming slots of one schedule. Returns how many were made. */
async function generate(row: Row, now: Date): Promise<number> {
  const a = Array.isArray(row.social_accounts) ? row.social_accounts[0] : row.social_accounts;
  if (!row.enabled || a?.status !== 'active') return 0;
  const group = row.hashtag_group_id
    ? await getGroup(row.company_id, row.hashtag_group_id).catch(() => null)
    : null;
  const body = group ? withHashtags(row.body, group.tags) : row.body;
  let made = 0;
  for (const slot of slotsFor(
    { daysOfWeek: row.days_of_week, timeOfDay: row.time_of_day, timezone: row.timezone },
    now,
    SCHEDULE_HORIZON_DAYS,
  )) {
    const id = await makePost({
      companyId: row.company_id,
      accountId: row.account_id,
      body,
      linkUrl: row.link_url,
      imageUrl: row.image_url,
      scheduledAt: slot.toISOString(),
      createdBy: row.created_by,
      scheduleId: row.id,
      scheduleSlot: slot.toISOString(),
    });
    if (id !== null) made += 1;
  }
  return made;
}

export async function createSchedule(actor: Actor, input: unknown): Promise<ScheduleView> {
  const companyId = need(actor);
  const parsed = scheduleInput.safeParse(input);
  if (!parsed.success)
    throw new ValidationError(parsed.error.issues[0]?.message ?? 'The schedule is not valid.');
  const d = parsed.data;
  const account = await getAccount(companyId, d.accountId);
  if (account.status !== 'active') throw new ConflictError('This account is paused.');
  if (d.hashtagGroupId) await getGroup(companyId, d.hashtagGroupId);
  if ((await listSchedules(companyId)).length >= MAX_SCHEDULES_PER_COMPANY)
    throw new ConflictError(`A company can have ${MAX_SCHEDULES_PER_COMPANY} schedules at most.`);
  const { data, error } = await getAdminSupabase()
    .from('social_schedules')
    .insert({
      company_id: companyId,
      account_id: d.accountId,
      name: d.name,
      body: d.body,
      link_url: d.linkUrl,
      image_url: d.imageUrl,
      hashtag_group_id: d.hashtagGroupId,
      days_of_week: d.daysOfWeek,
      time_of_day: d.timeOfDay,
      timezone: d.timezone,
      created_by: actor.userId,
    })
    .select(COLUMNS)
    .single();
  if (error) mapIntegrationError(error);
  const row = data as unknown as Row;
  const made = await generate(row, new Date());
  await record(companyId, 'social.schedule_created', 'social_schedule', row.id, {
    days: d.daysOfWeek,
    time: d.timeOfDay,
    timezone: d.timezone,
    posts: made,
  });
  return toView(row);
}

export async function updateSchedule(
  actor: Actor,
  id: string,
  input: unknown,
): Promise<ScheduleView> {
  const companyId = need(actor);
  const parsed = scheduleUpdate.safeParse(input);
  if (!parsed.success)
    throw new ValidationError(parsed.error.issues[0]?.message ?? 'The change is not valid.');
  const d = parsed.data;
  const current = await rowOf(companyId, id);
  if (d.hashtagGroupId) await getGroup(companyId, d.hashtagGroupId);
  const patch: Record<string, unknown> = {};
  if (d.name !== undefined) patch.name = d.name;
  if (d.body !== undefined) patch.body = d.body;
  if (d.linkUrl !== undefined) patch.link_url = d.linkUrl;
  if (d.imageUrl !== undefined) patch.image_url = d.imageUrl;
  if (d.hashtagGroupId !== undefined) patch.hashtag_group_id = d.hashtagGroupId;
  if (d.daysOfWeek !== undefined) patch.days_of_week = d.daysOfWeek;
  if (d.timeOfDay !== undefined) patch.time_of_day = d.timeOfDay;
  if (d.timezone !== undefined) patch.timezone = d.timezone;
  if (d.enabled !== undefined) patch.enabled = d.enabled;
  const { data, error } = await getAdminSupabase()
    .from('social_schedules')
    .update(patch)
    .eq('company_id', companyId)
    .eq('id', id)
    .eq('version', d.version)
    .is('deleted_at', null)
    .select(COLUMNS);
  if (error) mapIntegrationError(error);
  const row = (data ?? [])[0] as unknown as Row | undefined;
  if (!row) throw new ConflictError('The schedule changed. Reload and try again.');
  // What was already made no longer matches: remove it and make it again from the new pattern.
  const cancelled = await cancelFuture(id);
  const made = await generate(row, new Date());
  await record(companyId, 'social.schedule_changed', 'social_schedule', id, {
    fields: Object.keys(patch),
    cancelled,
    made,
    wasEnabled: current.enabled,
  });
  return toView(row);
}

export async function deleteSchedule(actor: Actor, id: string): Promise<void> {
  const companyId = need(actor);
  await rowOf(companyId, id);
  const cancelled = await cancelFuture(id);
  const { error } = await getAdminSupabase()
    .from('social_schedules')
    .update({ deleted_at: new Date().toISOString(), enabled: false })
    .eq('company_id', companyId)
    .eq('id', id);
  if (error) mapIntegrationError(error);
  await record(companyId, 'social.schedule_removed', 'social_schedule', id, { cancelled });
}

/** Cron, daily and hourly is fine (each slot is made once): makes the posts for the coming days of every enabled schedule. */
export async function runSchedules(): Promise<{ made: number }> {
  const { data, error } = await getAdminSupabase()
    .from('social_schedules')
    .select(COLUMNS)
    .eq('enabled', true)
    .is('deleted_at', null)
    .limit(1000);
  if (error) throw new InternalError(error);
  let made = 0;
  for (const row of (data ?? []) as unknown as Row[]) {
    try {
      made += await generate(row, new Date());
    } catch (e) {
      log.error('schedule failed', { scheduleId: row.id, error: e });
    }
  }
  return { made };
}
