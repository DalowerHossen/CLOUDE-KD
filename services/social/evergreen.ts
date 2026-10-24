// path: services/social/evergreen.ts
// The evergreen queue: old posts worth sharing again. Each item has up to six text variants (used in turn), a priority, and the
// account it belongs to. A plan per account says how often (every N days at a local time) the next item is posted; the cron job
// picks the item with the highest priority that was posted longest ago, makes a post and counts it. A short queue is noticed
// (once a week) so the owner can add more.
import 'server-only';
import {
  LOW_QUEUE_NOTICE_DAYS,
  MAX_EVERGREEN_ITEMS,
  type SocialProvider,
} from '@/config/s16-social';
import { ConflictError, InternalError, NotFoundError, ValidationError } from '@/lib/errors';
import { createLogger } from '@/lib/logger';
import { problemsFor } from '@/lib/social/rules';
import {
  evergreenDue,
  evergreenItemInput,
  evergreenItemUpdate,
  evergreenPlanInput,
  queueLow,
  rankEvergreen,
  variantFor,
} from '@/lib/social/schedule';
import { getAdminSupabase } from '@/lib/supabase/admin';
import type { Actor } from '@/types/contracts';
import { mapIntegrationError } from '@/services/publicapi/db-errors';
import { getAccount } from './accounts';
import { need, record } from './db';
import { makePost } from './make-post';

const log = createLogger({ service: 'social-evergreen' });
const ITEM_COLUMNS =
  'id, company_id, account_id, name, variants, link_url, image_url, priority, enabled, times_posted, last_posted_at, next_variant, version, social_accounts(display_name, provider, status)';

interface ItemRow {
  id: string;
  company_id: string;
  account_id: string;
  name: string;
  variants: string[];
  link_url: string | null;
  image_url: string | null;
  priority: number;
  enabled: boolean;
  times_posted: number;
  last_posted_at: string | null;
  next_variant: number;
  version: number;
  social_accounts:
    | { display_name: string; provider: string; status: string }
    | { display_name: string; provider: string; status: string }[]
    | null;
}

export interface EvergreenItemView {
  id: string;
  accountId: string;
  accountName: string;
  name: string;
  variants: string[];
  linkUrl: string | null;
  imageUrl: string | null;
  priority: number;
  enabled: boolean;
  timesPosted: number;
  lastPostedAt: string | null;
  version: number;
}

const accountOf = (
  r: ItemRow,
): { display_name: string; provider: string; status: string } | undefined =>
  Array.isArray(r.social_accounts) ? r.social_accounts[0] : (r.social_accounts ?? undefined);

const toView = (r: ItemRow): EvergreenItemView => ({
  id: r.id,
  accountId: r.account_id,
  accountName: accountOf(r)?.display_name ?? '',
  name: r.name,
  variants: r.variants,
  linkUrl: r.link_url,
  imageUrl: r.image_url,
  priority: r.priority,
  enabled: r.enabled,
  timesPosted: r.times_posted,
  lastPostedAt: r.last_posted_at,
  version: r.version,
});

export async function listItems(companyId: string): Promise<EvergreenItemView[]> {
  const { data, error } = await getAdminSupabase()
    .from('social_evergreen_items')
    .select(ITEM_COLUMNS)
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .order('priority', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(MAX_EVERGREEN_ITEMS);
  if (error) throw new InternalError(error);
  return ((data ?? []) as unknown as ItemRow[]).map(toView);
}

async function itemRow(companyId: string, id: string): Promise<ItemRow> {
  const { data, error } = await getAdminSupabase()
    .from('social_evergreen_items')
    .select(ITEM_COLUMNS)
    .eq('company_id', companyId)
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw new InternalError(error);
  if (!data) throw new NotFoundError();
  return data as unknown as ItemRow;
}

export async function createItem(actor: Actor, input: unknown): Promise<EvergreenItemView> {
  const companyId = need(actor);
  const parsed = evergreenItemInput.safeParse(input);
  if (!parsed.success)
    throw new ValidationError(parsed.error.issues[0]?.message ?? 'The item is not valid.');
  const d = parsed.data;
  const account = await getAccount(companyId, d.accountId);
  for (const text of d.variants) {
    const problems = problemsFor(account.provider, {
      body: text,
      linkUrl: d.linkUrl,
      imageUrl: d.imageUrl,
    });
    if (problems.length > 0) throw new ValidationError(problems[0] ?? 'The text is not valid.');
  }
  if ((await listItems(companyId)).length >= MAX_EVERGREEN_ITEMS)
    throw new ConflictError(`The queue can hold ${MAX_EVERGREEN_ITEMS} items at most.`);
  const { data, error } = await getAdminSupabase()
    .from('social_evergreen_items')
    .insert({
      company_id: companyId,
      account_id: d.accountId,
      name: d.name,
      variants: d.variants,
      link_url: d.linkUrl,
      image_url: d.imageUrl,
      priority: d.priority,
      created_by: actor.userId,
    })
    .select(ITEM_COLUMNS)
    .single();
  if (error) mapIntegrationError(error);
  const row = data as unknown as ItemRow;
  await record(companyId, 'social.evergreen_item_created', 'social_evergreen_item', row.id, {
    variants: d.variants.length,
  });
  return toView(row);
}

export async function updateItem(
  actor: Actor,
  id: string,
  input: unknown,
): Promise<EvergreenItemView> {
  const companyId = need(actor);
  const parsed = evergreenItemUpdate.safeParse(input);
  if (!parsed.success)
    throw new ValidationError(parsed.error.issues[0]?.message ?? 'The change is not valid.');
  const d = parsed.data;
  const current = await itemRow(companyId, id);
  const provider = accountOf(current)?.provider;
  if (
    provider &&
    (d.variants !== undefined || d.imageUrl !== undefined || d.linkUrl !== undefined)
  ) {
    const account = await getAccount(companyId, current.account_id);
    for (const text of d.variants ?? current.variants) {
      const problems = problemsFor(account.provider, {
        body: text,
        linkUrl: d.linkUrl === undefined ? current.link_url : d.linkUrl,
        imageUrl: d.imageUrl === undefined ? current.image_url : d.imageUrl,
      });
      if (problems.length > 0) throw new ValidationError(problems[0] ?? 'The text is not valid.');
    }
  }
  const patch: Record<string, unknown> = {};
  if (d.name !== undefined) patch.name = d.name;
  if (d.variants !== undefined) {
    patch.variants = d.variants;
    patch.next_variant = 0;
  }
  if (d.linkUrl !== undefined) patch.link_url = d.linkUrl;
  if (d.imageUrl !== undefined) patch.image_url = d.imageUrl;
  if (d.priority !== undefined) patch.priority = d.priority;
  if (d.enabled !== undefined) patch.enabled = d.enabled;
  const { data, error } = await getAdminSupabase()
    .from('social_evergreen_items')
    .update(patch)
    .eq('company_id', companyId)
    .eq('id', id)
    .eq('version', d.version)
    .is('deleted_at', null)
    .select(ITEM_COLUMNS);
  if (error) mapIntegrationError(error);
  const row = (data ?? [])[0] as unknown as ItemRow | undefined;
  if (!row) throw new ConflictError('The item changed. Reload and try again.');
  await record(companyId, 'social.evergreen_item_changed', 'social_evergreen_item', id, {
    fields: Object.keys(patch),
  });
  return toView(row);
}

export async function deleteItem(actor: Actor, id: string): Promise<void> {
  const companyId = need(actor);
  await itemRow(companyId, id);
  const { error } = await getAdminSupabase()
    .from('social_evergreen_items')
    .update({ deleted_at: new Date().toISOString(), enabled: false })
    .eq('company_id', companyId)
    .eq('id', id);
  if (error) mapIntegrationError(error);
  await record(companyId, 'social.evergreen_item_removed', 'social_evergreen_item', id, {});
}

export interface PlanView {
  id: string;
  accountId: string;
  accountName: string;
  everyDays: number;
  timeOfDay: string;
  timezone: string;
  minItems: number;
  enabled: boolean;
  lastRunAt: string | null;
  version: number;
}

const PLAN_COLUMNS =
  'id, company_id, account_id, every_days, time_of_day, timezone, min_items, enabled, last_run_at, last_low_notice_at, version, social_accounts(display_name, provider, status)';

interface PlanRow {
  id: string;
  company_id: string;
  account_id: string;
  every_days: number;
  time_of_day: string;
  timezone: string;
  min_items: number;
  enabled: boolean;
  last_run_at: string | null;
  last_low_notice_at: string | null;
  version: number;
  social_accounts:
    | { display_name: string; provider: string; status: string }
    | { display_name: string; provider: string; status: string }[]
    | null;
}

const planAccount = (
  r: PlanRow,
): { display_name: string; provider: string; status: string } | undefined =>
  Array.isArray(r.social_accounts) ? r.social_accounts[0] : (r.social_accounts ?? undefined);

export async function listPlans(companyId: string): Promise<PlanView[]> {
  const { data, error } = await getAdminSupabase()
    .from('social_evergreen_plans')
    .select(PLAN_COLUMNS)
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .limit(100);
  if (error) throw new InternalError(error);
  return ((data ?? []) as unknown as PlanRow[]).map((r) => ({
    id: r.id,
    accountId: r.account_id,
    accountName: planAccount(r)?.display_name ?? '',
    everyDays: r.every_days,
    timeOfDay: r.time_of_day,
    timezone: r.timezone,
    minItems: r.min_items,
    enabled: r.enabled,
    lastRunAt: r.last_run_at,
    version: r.version,
  }));
}

/** Sets how often an account posts from the queue (one plan per account). */
export async function savePlan(actor: Actor, input: unknown): Promise<PlanView[]> {
  const companyId = need(actor);
  const parsed = evergreenPlanInput.safeParse(input);
  if (!parsed.success)
    throw new ValidationError(parsed.error.issues[0]?.message ?? 'The plan is not valid.');
  const d = parsed.data;
  await getAccount(companyId, d.accountId);
  const admin = getAdminSupabase();
  const existing = await admin
    .from('social_evergreen_plans')
    .select('id, version')
    .eq('company_id', companyId)
    .eq('account_id', d.accountId)
    .is('deleted_at', null)
    .maybeSingle();
  if (existing.error) throw new InternalError(existing.error);
  const values = {
    every_days: d.everyDays,
    time_of_day: d.timeOfDay,
    timezone: d.timezone,
    min_items: d.minItems,
    enabled: d.enabled,
  };
  if (existing.data) {
    const r = await admin
      .from('social_evergreen_plans')
      .update(values)
      .eq('id', String(existing.data.id))
      .eq('version', Number(existing.data.version))
      .select('id');
    if (r.error) mapIntegrationError(r.error);
    if ((r.data ?? []).length === 0)
      throw new ConflictError('The plan changed. Reload and try again.');
  } else {
    const r = await admin
      .from('social_evergreen_plans')
      .insert({ company_id: companyId, account_id: d.accountId, ...values });
    if (r.error) mapIntegrationError(r.error);
  }
  await record(companyId, 'social.evergreen_plan_saved', 'social_evergreen_plan', null, {
    accountId: d.accountId,
    everyDays: d.everyDays,
    enabled: d.enabled,
  });
  return listPlans(companyId);
}

/** Accounts whose queue is shorter than the plan wants (shown on the page). */
export async function lowQueues(
  companyId: string,
): Promise<{ accountName: string; items: number; minItems: number }[]> {
  const [plans, items] = await Promise.all([listPlans(companyId), listItems(companyId)]);
  return plans
    .filter((p) => p.enabled)
    .map((p) => ({
      accountName: p.accountName,
      items: items.filter((i) => i.enabled && i.accountId === p.accountId).length,
      minItems: p.minItems,
    }))
    .filter((q) => queueLow(q.items, q.minItems));
}

/** Cron, every 15 minutes: posts the next item of each plan that is due, and notices short queues. */
export async function runEvergreen(): Promise<{ posted: number }> {
  const admin = getAdminSupabase();
  const { data, error } = await admin
    .from('social_evergreen_plans')
    .select(PLAN_COLUMNS)
    .eq('enabled', true)
    .is('deleted_at', null)
    .limit(1000);
  if (error) throw new InternalError(error);
  const now = new Date();
  let posted = 0;
  for (const plan of (data ?? []) as unknown as PlanRow[]) {
    try {
      const account = planAccount(plan);
      if (account?.status !== 'active') continue;
      const items = await admin
        .from('social_evergreen_items')
        .select(
          'id, name, variants, link_url, image_url, priority, last_posted_at, next_variant, times_posted',
        )
        .eq('account_id', plan.account_id)
        .eq('enabled', true)
        .is('deleted_at', null)
        .limit(MAX_EVERGREEN_ITEMS);
      if (items.error) throw new InternalError(items.error);
      const list = (items.data ?? []).map((i) => ({
        id: String(i.id),
        priority: Number(i.priority),
        lastPostedAt: i.last_posted_at === null ? null : String(i.last_posted_at),
        variants: (i.variants as string[]) ?? [],
        nextVariant: Number(i.next_variant),
        linkUrl: i.link_url === null ? null : String(i.link_url),
        imageUrl: i.image_url === null ? null : String(i.image_url),
        timesPosted: Number(i.times_posted),
      }));
      const noticeDue =
        plan.last_low_notice_at === null ||
        Date.parse(plan.last_low_notice_at) < now.getTime() - LOW_QUEUE_NOTICE_DAYS * 86_400_000;
      if (queueLow(list.length, plan.min_items) && noticeDue) {
        await record(
          plan.company_id,
          'social.evergreen_queue_low',
          'social_evergreen_plan',
          plan.id,
          {
            items: list.length,
            minItems: plan.min_items,
          },
        );
        await admin
          .from('social_evergreen_plans')
          .update({ last_low_notice_at: now.toISOString() })
          .eq('id', plan.id);
      }
      if (
        !evergreenDue(
          {
            everyDays: plan.every_days,
            timeOfDay: plan.time_of_day,
            timezone: plan.timezone,
            lastRunAt: plan.last_run_at,
          },
          now,
        )
      )
        continue;
      let usedId: string | null = null;
      for (const item of rankEvergreen(list).slice(0, 5)) {
        const pick = variantFor(item);
        const problems = problemsFor(account.provider as SocialProvider, {
          body: pick.text,
          linkUrl: item.linkUrl,
          imageUrl: item.imageUrl,
        });
        if (problems.length > 0) continue;
        const postId = await makePost({
          companyId: plan.company_id,
          accountId: plan.account_id,
          body: pick.text,
          linkUrl: item.linkUrl,
          imageUrl: item.imageUrl,
          scheduledAt: new Date(now.getTime() + 120_000).toISOString(),
          createdBy: null,
          evergreenItemId: item.id,
        });
        if (postId === null) continue;
        const upd = await admin
          .from('social_evergreen_items')
          .update({
            times_posted: item.timesPosted + 1,
            last_posted_at: now.toISOString(),
            next_variant: pick.next,
          })
          .eq('id', item.id);
        if (upd.error) throw new InternalError(upd.error);
        usedId = item.id;
        posted += 1;
        await record(plan.company_id, 'social.evergreen_posted', 'social_evergreen_item', item.id, {
          postId,
        });
        break;
      }
      // With no usable item the plan waits for its next turn instead of trying every 15 minutes.
      if (usedId !== null || list.length > 0)
        await admin
          .from('social_evergreen_plans')
          .update({ last_run_at: now.toISOString() })
          .eq('id', plan.id);
    } catch (e) {
      log.error('evergreen plan failed', { planId: plan.id, error: e });
    }
  }
  return { posted };
}
