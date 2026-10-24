// path: services/social/analytics.ts
// Social analytics: posts published in a period against the period before, posts per account, the best hours (from the clicks of
// tracked links), the top posts by clicks, and the numbers Threads reports for its posts (views, likes, replies, reposts, quotes,
// shares, and the engagement rate). The numbers of Facebook and Instagram posts are not read yet (their documentation was not
// read in 16.4.b). A cron job refreshes the Threads numbers.
import 'server-only';
import {
  ANALYTICS_MAX_DAYS,
  STATS_BATCH,
  STATS_REFRESH_HOURS,
  STATS_WINDOW_DAYS,
} from '@/config/s16-social';
import { InternalError } from '@/lib/errors';
import { createLogger } from '@/lib/logger';
import {
  bestHours,
  compare,
  engagementRate,
  topPosts,
  type BestHour,
  type Comparison,
  type PostScore,
} from '@/lib/social/analytics';
import { SocialApiError } from '@/lib/social/graph';
import { adapterFor } from '@/lib/social/registry';
import { isTimeZone } from '@/lib/social/schedule';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { tokenOf } from './accounts';

const log = createLogger({ service: 'social-analytics' });

export interface AnalyticsView {
  days: number;
  published: Comparison;
  clicks: Comparison;
  perAccount: { accountId: string; accountName: string; published: number }[];
  bestHours: BestHour[];
  timezone: string;
  topPosts: {
    postId: string;
    body: string;
    accountName: string;
    clicks: number;
    views: number | null;
    engagement: string | null;
    url: string | null;
  }[];
  threads: {
    views: number;
    likes: number;
    replies: number;
    reposts: number;
    quotes: number;
    shares: number;
    engagement: string | null;
    posts: number;
  };
}

const sum = (rows: readonly { clicks: number }[]): number => rows.reduce((n, r) => n + r.clicks, 0);

export async function overview(
  companyId: string,
  options: { days: number; timezone: string },
): Promise<AnalyticsView> {
  const days = Math.min(Math.max(options.days, 1), ANALYTICS_MAX_DAYS);
  const timezone = isTimeZone(options.timezone) ? options.timezone : 'UTC';
  const admin = getAdminSupabase();
  const now = Date.now();
  const start = new Date(now - days * 86_400_000).toISOString();
  const prevStart = new Date(now - 2 * days * 86_400_000).toISOString();

  const posts = await admin
    .from('social_posts')
    .select('id, body, account_id, published_at, external_url, social_accounts(display_name)')
    .eq('company_id', companyId)
    .eq('status', 'published')
    .gte('published_at', prevStart)
    .is('deleted_at', null)
    .limit(5000);
  if (posts.error) throw new InternalError(posts.error);
  const rows = posts.data ?? [];
  const current = rows.filter((r) => String(r.published_at) >= start);
  const previousCount = rows.length - current.length;

  const hours = await admin
    .from('social_link_hours')
    .select('hour_start, clicks, link_id')
    .eq('company_id', companyId)
    .gte('hour_start', prevStart)
    .limit(20000);
  if (hours.error) throw new InternalError(hours.error);
  const hourRows = (hours.data ?? []).map((h) => ({
    hourStart: String(h.hour_start),
    clicks: Number(h.clicks),
    linkId: String(h.link_id),
  }));
  const hoursNow = hourRows.filter((h) => h.hourStart >= start);

  const links = await admin
    .from('social_links')
    .select('id, post_id')
    .eq('company_id', companyId)
    .limit(20000);
  if (links.error) throw new InternalError(links.error);
  const postOfLink = new Map((links.data ?? []).map((l) => [String(l.id), String(l.post_id)]));
  const clicksOfPost = new Map<string, number>();
  for (const h of hoursNow) {
    const p = postOfLink.get(h.linkId);
    if (p) clicksOfPost.set(p, (clicksOfPost.get(p) ?? 0) + h.clicks);
  }

  const stats = await admin
    .from('social_post_stats')
    .select('post_id, metrics')
    .eq('company_id', companyId)
    .limit(5000);
  if (stats.error) throw new InternalError(stats.error);
  const metricsOf = new Map(
    (stats.data ?? []).map((s) => [String(s.post_id), (s.metrics ?? {}) as Record<string, number>]),
  );

  const perAccount = new Map<
    string,
    { accountId: string; accountName: string; published: number }
  >();
  for (const r of current) {
    const a = r.social_accounts as { display_name?: string } | { display_name?: string }[] | null;
    const name = String((Array.isArray(a) ? a[0] : a)?.display_name ?? '');
    const key = String(r.account_id);
    const e = perAccount.get(key) ?? { accountId: key, accountName: name, published: 0 };
    e.published += 1;
    perAccount.set(key, e);
  }

  const scores: PostScore[] = current.map((r) => ({
    postId: String(r.id),
    clicks: clicksOfPost.get(String(r.id)) ?? 0,
    views: metricsOf.get(String(r.id))?.views ?? null,
  }));
  const byId = new Map(current.map((r) => [String(r.id), r]));
  const top = topPosts(scores, 5)
    .filter((s) => s.clicks > 0 || s.views !== null)
    .map((s) => {
      const r = byId.get(s.postId);
      const a = r?.social_accounts as
        { display_name?: string } | { display_name?: string }[] | null | undefined;
      return {
        postId: s.postId,
        body: String(r?.body ?? '').slice(0, 140),
        accountName: String((Array.isArray(a) ? a[0] : a)?.display_name ?? ''),
        clicks: s.clicks,
        views: s.views,
        engagement: engagementRate(metricsOf.get(s.postId) ?? {}),
        url: r?.external_url ? String(r.external_url) : null,
      };
    });

  const total = { views: 0, likes: 0, replies: 0, reposts: 0, quotes: 0, shares: 0 };
  let counted = 0;
  for (const r of current) {
    const m = metricsOf.get(String(r.id));
    if (!m) continue;
    counted += 1;
    for (const k of Object.keys(total) as (keyof typeof total)[]) total[k] += m[k] ?? 0;
  }

  return {
    days,
    published: compare(current.length, previousCount),
    clicks: compare(sum(hoursNow), sum(hourRows) - sum(hoursNow)),
    perAccount: [...perAccount.values()].sort((a, b) => b.published - a.published),
    bestHours: bestHours(hoursNow, timezone, 5),
    timezone,
    topPosts: top,
    threads: { ...total, engagement: engagementRate(total), posts: counted },
  };
}

/** Cron, hourly: reads the numbers of recent Threads posts that have none or old ones. */
export async function refreshStats(): Promise<{ updated: number }> {
  const admin = getAdminSupabase();
  const since = new Date(Date.now() - STATS_WINDOW_DAYS * 86_400_000).toISOString();
  const { data, error } = await admin
    .from('social_posts')
    .select('id, company_id, account_id, external_id, social_accounts!inner(provider)')
    .eq('status', 'published')
    .eq('social_accounts.provider', 'threads')
    .not('external_id', 'is', null)
    .gte('published_at', since)
    .is('deleted_at', null)
    .order('published_at', { ascending: false })
    .limit(300);
  if (error) throw new InternalError(error);
  const ids = (data ?? []).map((r) => String(r.id));
  const known = ids.length
    ? await admin.from('social_post_stats').select('post_id, fetched_at').in('post_id', ids)
    : { data: [], error: null };
  if (known.error) throw new InternalError(known.error);
  const fetchedAt = new Map(
    (known.data ?? []).map((k) => [String(k.post_id), String(k.fetched_at)]),
  );
  const staleBefore = new Date(Date.now() - STATS_REFRESH_HOURS * 3_600_000).toISOString();
  const todo = (data ?? [])
    .filter((r) => (fetchedAt.get(String(r.id)) ?? '') < staleBefore)
    .slice(0, STATS_BATCH);
  let updated = 0;
  for (const r of todo) {
    try {
      const account = await tokenOf(String(r.company_id), String(r.account_id));
      const adapter = adapterFor(account.provider);
      if (!adapter.insights || account.status !== 'active') continue;
      const metrics = await adapter.insights(
        { provider: account.provider, externalId: account.externalId, token: account.token },
        String(r.external_id),
      );
      const row = {
        company_id: String(r.company_id),
        post_id: String(r.id),
        metrics,
        fetched_at: new Date().toISOString(),
      };
      const write = fetchedAt.has(String(r.id))
        ? await admin
            .from('social_post_stats')
            .update({ metrics, fetched_at: row.fetched_at })
            .eq('post_id', row.post_id)
        : await admin.from('social_post_stats').insert(row);
      if (write.error) throw new InternalError(write.error);
      updated += 1;
    } catch (e) {
      if (e instanceof SocialApiError)
        log.warn('insights refused', { postId: String(r.id), status: e.httpStatus });
      else log.error('insights failed', { postId: String(r.id), error: e });
    }
  }
  return { updated };
}
