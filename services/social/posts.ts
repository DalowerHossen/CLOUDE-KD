// path: services/social/posts.ts
// Social posts: write a draft (a hashtag group can be added), check it against the rules of its network, schedule it, publish it
// now, and let the cron job publish what is due and finish what is waiting. A post is claimed before it is sent, so two workers
// never send it twice. A network account may publish only so many posts in a moving 24 hours (a limit kept here as well as by the
// network). A temporary failure is tried again later (three tries); a refusal by the network is final and shown on the post.
import 'server-only';
import {
  MAX_PUBLISH_ATTEMPTS,
  PUBLISHING_STALE_MINUTES,
  type SocialProvider,
} from '@/config/s16-social';
import { ConflictError, InternalError, NotFoundError, ValidationError } from '@/lib/errors';
import { createLogger } from '@/lib/logger';
import { SocialApiError } from '@/lib/social/graph';
import { adapterFor } from '@/lib/social/registry';
import {
  dailyLimitOf,
  postInput,
  postUpdate,
  problemsFor,
  withHashtags,
  withinDailyLimit,
} from '@/lib/social/rules';
import { getAdminSupabase } from '@/lib/supabase/admin';
import type { Actor } from '@/types/contracts';
import { mapIntegrationError } from '@/services/publicapi/db-errors';
import { tokenOf } from './accounts';
import { need, record } from './db';
import { getGroup } from './hashtags';

const log = createLogger({ service: 'social-posts' });
const COLUMNS =
  'id, account_id, body, link_url, image_url, status, scheduled_at, external_id, external_url, container_id, publish_after, attempts, last_error, published_at, version, created_at, social_accounts(provider, display_name)';

interface Row {
  id: string;
  account_id: string;
  body: string;
  link_url: string | null;
  image_url: string | null;
  status: string;
  scheduled_at: string | null;
  external_id: string | null;
  external_url: string | null;
  container_id: string | null;
  publish_after: string | null;
  attempts: number;
  last_error: string | null;
  published_at: string | null;
  version: number;
  created_at: string;
  social_accounts:
    | { provider: string; display_name: string }
    | { provider: string; display_name: string }[]
    | null;
}

export interface PostView {
  id: string;
  accountId: string;
  provider: SocialProvider;
  accountName: string;
  body: string;
  linkUrl: string | null;
  imageUrl: string | null;
  status: 'draft' | 'scheduled' | 'publishing' | 'published' | 'failed' | 'cancelled';
  scheduledAt: string | null;
  externalId: string | null;
  externalUrl: string | null;
  attempts: number;
  lastError: string | null;
  publishedAt: string | null;
  version: number;
  createdAt: string;
}

const STATES = ['draft', 'scheduled', 'publishing', 'published', 'failed', 'cancelled'] as const;
const PROVIDERS: readonly SocialProvider[] = ['facebook', 'instagram', 'threads', 'sandbox'];

export const toPostView = (r: Row): PostView => {
  const a = Array.isArray(r.social_accounts) ? r.social_accounts[0] : r.social_accounts;
  return {
    id: r.id,
    accountId: r.account_id,
    provider: PROVIDERS.find((p) => p === a?.provider) ?? 'sandbox',
    accountName: a?.display_name ?? '',
    body: r.body,
    linkUrl: r.link_url,
    imageUrl: r.image_url,
    status: STATES.find((s) => s === r.status) ?? 'draft',
    scheduledAt: r.scheduled_at,
    externalId: r.external_id,
    externalUrl: r.external_url,
    attempts: r.attempts,
    lastError: r.last_error,
    publishedAt: r.published_at,
    version: r.version,
    createdAt: r.created_at,
  };
};

export async function listPosts(
  companyId: string,
  options: { status?: string; limit?: number } = {},
): Promise<PostView[]> {
  let q = getAdminSupabase()
    .from('social_posts')
    .select(COLUMNS)
    .eq('company_id', companyId)
    .is('deleted_at', null);
  if (options.status) q = q.eq('status', options.status);
  const { data, error } = await q
    .order('id', { ascending: false })
    .limit(Math.min(Math.max(options.limit ?? 50, 1), 200));
  if (error) throw new InternalError(error);
  return ((data ?? []) as unknown as Row[]).map(toPostView);
}

export async function getPost(companyId: string, id: string): Promise<PostView> {
  const { data, error } = await getAdminSupabase()
    .from('social_posts')
    .select(COLUMNS)
    .eq('company_id', companyId)
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw new InternalError(error);
  if (!data) throw new NotFoundError();
  return toPostView(data as unknown as Row);
}

export async function createPost(actor: Actor, input: unknown): Promise<PostView> {
  const companyId = need(actor);
  const parsed = postInput.safeParse(input);
  if (!parsed.success)
    throw new ValidationError(parsed.error.issues[0]?.message ?? 'The post is not valid.');
  const d = parsed.data;
  const group = d.hashtagGroupId ? await getGroup(companyId, d.hashtagGroupId) : null;
  const body = group ? withHashtags(d.body, group.tags) : d.body;
  if (d.scheduledAt !== null && Date.parse(d.scheduledAt) <= Date.now())
    throw new ValidationError('Choose a time in the future.');
  const { data, error } = await getAdminSupabase()
    .from('social_posts')
    .insert({
      company_id: companyId,
      account_id: d.accountId,
      body,
      link_url: d.linkUrl,
      image_url: d.imageUrl,
      status: d.scheduledAt ? 'scheduled' : 'draft',
      scheduled_at: d.scheduledAt,
      created_by: actor.userId,
    })
    .select(COLUMNS)
    .single();
  if (error) mapIntegrationError(error);
  const view = toPostView(data as unknown as Row);
  await record(companyId, 'social.post_created', 'social_post', view.id, {
    provider: view.provider,
    scheduled: view.scheduledAt,
  });
  return view;
}

export async function updatePost(actor: Actor, id: string, input: unknown): Promise<PostView> {
  const companyId = need(actor);
  const parsed = postUpdate.safeParse(input);
  if (!parsed.success)
    throw new ValidationError(parsed.error.issues[0]?.message ?? 'The change is not valid.');
  const d = parsed.data;
  const current = await getPost(companyId, id);
  if (current.status !== 'draft' && current.status !== 'scheduled' && current.status !== 'failed')
    throw new ConflictError('This post can no longer be changed.');
  const patch: Record<string, unknown> = {};
  if (d.body !== undefined) patch.body = d.body;
  if (d.linkUrl !== undefined) patch.link_url = d.linkUrl;
  if (d.imageUrl !== undefined) patch.image_url = d.imageUrl;
  if (d.scheduledAt !== undefined) {
    if (d.scheduledAt !== null && Date.parse(d.scheduledAt) <= Date.now())
      throw new ValidationError('Choose a time in the future.');
    patch.scheduled_at = d.scheduledAt;
    patch.status = d.scheduledAt === null ? 'draft' : 'scheduled';
  } else if (current.status === 'failed') {
    patch.status = 'draft';
  }
  const { data, error } = await getAdminSupabase()
    .from('social_posts')
    .update(patch)
    .eq('company_id', companyId)
    .eq('id', id)
    .eq('version', d.version)
    .select('id');
  if (error) mapIntegrationError(error);
  if ((data ?? []).length === 0) throw new ConflictError('The post changed. Reload and try again.');
  await record(companyId, 'social.post_changed', 'social_post', id, { fields: Object.keys(patch) });
  return getPost(companyId, id);
}

export async function cancelPost(actor: Actor, id: string): Promise<PostView> {
  const companyId = need(actor);
  const { data, error } = await getAdminSupabase()
    .from('social_posts')
    .update({ status: 'cancelled' })
    .eq('company_id', companyId)
    .eq('id', id)
    .in('status', ['draft', 'scheduled', 'failed'])
    .select('id');
  if (error) mapIntegrationError(error);
  if ((data ?? []).length === 0) throw new ConflictError('This post cannot be cancelled now.');
  await record(companyId, 'social.post_cancelled', 'social_post', id, {});
  return getPost(companyId, id);
}

/** What is wrong with a post for its network, without sending anything. */
export async function checkPost(
  companyId: string,
  id: string,
): Promise<{ problems: string[]; limitReached: boolean }> {
  const post = await getPost(companyId, id);
  const used = await publishedLast24h(post.accountId);
  return {
    problems: problemsFor(post.provider, {
      body: post.body,
      linkUrl: post.linkUrl,
      imageUrl: post.imageUrl,
    }),
    limitReached: !withinDailyLimit(post.provider, used),
  };
}

async function publishedLast24h(accountId: string): Promise<number> {
  const { count, error } = await getAdminSupabase()
    .from('social_posts')
    .select('id', { count: 'exact', head: true })
    .eq('account_id', accountId)
    .eq('status', 'published')
    .gt('published_at', new Date(Date.now() - 86_400_000).toISOString());
  if (error) throw new InternalError(error);
  return count ?? 0;
}

interface Claimed {
  id: string;
  company_id: string;
  account_id: string;
  body: string;
  link_url: string | null;
  image_url: string | null;
  attempts: number;
}

async function fail(
  id: string,
  attempts: number,
  message: string,
  retryable: boolean,
): Promise<'failed' | 'retry'> {
  const admin = getAdminSupabase();
  if (retryable && attempts < MAX_PUBLISH_ATTEMPTS) {
    const at = new Date(Date.now() + attempts * 5 * 60_000).toISOString();
    const r = await admin
      .from('social_posts')
      .update({
        status: 'scheduled',
        scheduled_at: at,
        last_error: message.slice(0, 300),
        container_id: null,
        publish_after: null,
      })
      .eq('id', id);
    if (r.error) throw new InternalError(r.error);
    return 'retry';
  }
  const r = await admin
    .from('social_posts')
    .update({
      status: 'failed',
      last_error: message.slice(0, 300),
      container_id: null,
      publish_after: null,
    })
    .eq('id', id);
  if (r.error) throw new InternalError(r.error);
  return 'failed';
}

/** Claims one post (draft, scheduled or failed) and sends it. Returns the post as it stands afterwards. */
export async function publishPost(
  companyId: string,
  id: string,
  by: string | null,
): Promise<PostView> {
  const admin = getAdminSupabase();
  const post = await getPost(companyId, id);
  if (post.status !== 'draft' && post.status !== 'scheduled' && post.status !== 'failed')
    throw new ConflictError('This post cannot be published now.');
  const problems = problemsFor(post.provider, {
    body: post.body,
    linkUrl: post.linkUrl,
    imageUrl: post.imageUrl,
  });
  if (problems.length > 0)
    throw new ValidationError(problems[0] ?? 'The post is not valid for this network.');
  if (!withinDailyLimit(post.provider, await publishedLast24h(post.accountId)))
    throw new ConflictError(
      `This account reached its limit of ${dailyLimitOf(post.provider)} posts in 24 hours.`,
    );
  const claim = await admin
    .from('social_posts')
    .update({ status: 'publishing', attempts: post.attempts + 1, last_error: null })
    .eq('company_id', companyId)
    .eq('id', id)
    .in('status', ['draft', 'scheduled', 'failed'])
    .select('id, company_id, account_id, body, link_url, image_url, attempts');
  if (claim.error) mapIntegrationError(claim.error);
  const row = (claim.data ?? [])[0] as unknown as Claimed | undefined;
  if (!row) throw new ConflictError('This post was taken by another request.');
  await sendClaimed(row);
  await record(companyId, 'social.post_published_requested', 'social_post', id, { by });
  return getPost(companyId, id);
}

async function sendClaimed(row: Claimed): Promise<void> {
  const admin = getAdminSupabase();
  try {
    const account = await tokenOf(row.company_id, row.account_id);
    if (account.status !== 'active') {
      await fail(
        row.id,
        MAX_PUBLISH_ATTEMPTS,
        'The account is paused or needs to be connected again.',
        false,
      );
      return;
    }
    const adapter = adapterFor(account.provider);
    const result = await adapter.publish(
      { provider: account.provider, externalId: account.externalId, token: account.token },
      { body: row.body, linkUrl: row.link_url, imageUrl: row.image_url },
    );
    if (result.state === 'published') {
      const r = await admin
        .from('social_posts')
        .update({
          status: 'published',
          external_id: result.externalId,
          external_url: result.url,
          published_at: new Date().toISOString(),
          container_id: null,
          publish_after: null,
        })
        .eq('id', row.id);
      if (r.error) throw new InternalError(r.error);
    } else {
      const r = await admin
        .from('social_posts')
        .update({
          container_id: result.containerId,
          publish_after: new Date(Date.now() + result.publishAfterSeconds * 1000).toISOString(),
        })
        .eq('id', row.id);
      if (r.error) throw new InternalError(r.error);
    }
  } catch (error) {
    if (error instanceof SocialApiError) {
      const outcome = await fail(row.id, row.attempts, error.message, error.retryable);
      if (outcome === 'failed' && error.httpStatus === 401)
        await markReconnect(row.account_id, error.message);
    } else {
      log.error('post publishing failed', { postId: row.id, error });
      await fail(row.id, row.attempts, 'The post could not be sent.', true);
    }
  }
}

async function markReconnect(accountId: string, message: string): Promise<void> {
  await getAdminSupabase()
    .from('social_accounts')
    .update({ status: 'needs_reconnect', last_error: message.slice(0, 300) })
    .eq('id', accountId);
}

/** Cron, every minute: publishes the posts whose time has come. */
export async function runDuePosts(limit = 20): Promise<{ claimed: number }> {
  const admin = getAdminSupabase();
  const { data, error } = await admin
    .from('social_posts')
    .select('id, company_id, account_id, social_accounts(provider)')
    .eq('status', 'scheduled')
    .lte('scheduled_at', new Date().toISOString())
    .is('deleted_at', null)
    .order('scheduled_at', { ascending: true })
    .limit(limit);
  if (error) throw new InternalError(error);
  let claimed = 0;
  for (const r of data ?? []) {
    try {
      await publishPost(String(r.company_id), String(r.id), null);
      claimed += 1;
    } catch (e) {
      // A post that cannot be published (a rule of its network, the daily limit) is marked failed with the reason; a lost claim is ignored.
      if (e instanceof ConflictError) {
        if (/limit/.test(e.message)) {
          await admin
            .from('social_posts')
            .update({
              scheduled_at: new Date(Date.now() + 3_600_000).toISOString(),
              last_error: e.message.slice(0, 300),
            })
            .eq('id', String(r.id))
            .eq('status', 'scheduled');
        }
        continue;
      }
      if (e instanceof ValidationError) {
        await admin
          .from('social_posts')
          .update({ status: 'publishing' })
          .eq('id', String(r.id))
          .eq('status', 'scheduled');
        await admin
          .from('social_posts')
          .update({ status: 'failed', last_error: e.message.slice(0, 300) })
          .eq('id', String(r.id));
        continue;
      }
      log.error('due post failed', { postId: String(r.id), error: e });
    }
  }
  return { claimed };
}

/** Cron, every minute: finishes the posts that wait for their container (Threads, a slow Instagram image) and fails the stuck ones. */
export async function runPendingPosts(limit = 20): Promise<{ finished: number }> {
  const admin = getAdminSupabase();
  const stale = new Date(Date.now() - PUBLISHING_STALE_MINUTES * 60_000).toISOString();
  const stuck = await admin
    .from('social_posts')
    .update({ status: 'failed', last_error: 'The post did not finish. Try again.' })
    .eq('status', 'publishing')
    .is('container_id', null)
    .lt('updated_at', stale);
  if (stuck.error) throw new InternalError(stuck.error);
  const { data, error } = await admin
    .from('social_posts')
    .select('id, company_id, account_id, attempts, container_id')
    .eq('status', 'publishing')
    .not('container_id', 'is', null)
    .lte('publish_after', new Date().toISOString())
    .is('deleted_at', null)
    .order('publish_after', { ascending: true })
    .limit(limit);
  if (error) throw new InternalError(error);
  let finished = 0;
  for (const r of data ?? []) {
    const id = String(r.id);
    try {
      const account = await tokenOf(String(r.company_id), String(r.account_id));
      const adapter = adapterFor(account.provider);
      if (!adapter.finish) {
        await fail(id, MAX_PUBLISH_ATTEMPTS, 'This network cannot finish a post.', false);
        continue;
      }
      const done = await adapter.finish(
        { provider: account.provider, externalId: account.externalId, token: account.token },
        String(r.container_id),
      );
      const upd = await admin
        .from('social_posts')
        .update({
          status: 'published',
          external_id: done.externalId,
          external_url: done.url,
          published_at: new Date().toISOString(),
          container_id: null,
          publish_after: null,
        })
        .eq('id', id);
      if (upd.error) throw new InternalError(upd.error);
      finished += 1;
    } catch (e) {
      const attempts = Number(r.attempts) + 1;
      if (e instanceof SocialApiError && e.retryable && attempts < MAX_PUBLISH_ATTEMPTS + 2) {
        await admin
          .from('social_posts')
          .update({
            attempts,
            publish_after: new Date(Date.now() + 60_000).toISOString(),
            last_error: e.message.slice(0, 300),
          })
          .eq('id', id);
      } else {
        await fail(
          id,
          MAX_PUBLISH_ATTEMPTS,
          e instanceof SocialApiError ? e.message : 'The post could not be finished.',
          false,
        );
        log.warn('pending post failed', { postId: id });
      }
    }
  }
  return { finished };
}
