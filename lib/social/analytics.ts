// path: lib/social/analytics.ts
// Social analytics as pure functions: the best hours to post from the clicks of tracked links, a comparison of two periods, the top
// posts, and the engagement rate of a Threads post. No database or network here.
import { floorDiv, toInt } from '@/lib/reports/numbers';
import { localHour } from './schedule';

export interface HourBucket {
  hourStart: string;
  clicks: number;
}

export interface BestHour {
  hour: number;
  clicks: number;
}

/** The hours of the day (in a time zone) with the most clicks, best first; hours without clicks are left out. */
export function bestHours(
  buckets: readonly HourBucket[],
  zoneName: string,
  top: number,
): BestHour[] {
  const sums = new Map<number, number>();
  for (const b of buckets) {
    const h = localHour(new Date(b.hourStart), zoneName);
    sums.set(h, (sums.get(h) ?? 0) + b.clicks);
  }
  return [...sums.entries()]
    .filter(([, clicks]) => clicks > 0)
    .map(([hour, clicks]) => ({ hour, clicks }))
    .sort((a, b) => b.clicks - a.clicks || a.hour - b.hour)
    .slice(0, top);
}

export interface Comparison {
  current: number;
  previous: number;
  /** Change in percent with one decimal ("12.5"), or null when the earlier period had none. */
  changePercent: string | null;
}

const tenthsText = (tenths: number): string => {
  const abs = tenths < 0 ? -tenths : tenths;
  return `${tenths < 0 ? '-' : ''}${floorDiv(abs, 10)}.${abs % 10}`;
};

export function compare(current: number, previous: number): Comparison {
  if (previous === 0) return { current, previous, changePercent: null };
  return {
    current,
    previous,
    changePercent: tenthsText(floorDiv((current - previous) * 1000, previous)),
  };
}

export interface PostScore {
  postId: string;
  clicks: number;
  views: number | null;
}

/** The posts with the most clicks (then views), best first. */
export function topPosts(rows: readonly PostScore[], top: number): PostScore[] {
  return [...rows]
    .sort(
      (a, b) =>
        b.clicks - a.clicks || (b.views ?? 0) - (a.views ?? 0) || a.postId.localeCompare(b.postId),
    )
    .slice(0, top);
}

/** The metrics Threads returned for a post, kept as whole numbers. */
export function metricsOf(json: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  const data = (json as { data?: unknown } | null)?.data;
  if (!Array.isArray(data)) return out;
  for (const item of data) {
    if (item === null || typeof item !== 'object') continue;
    const row = item as { name?: unknown; values?: unknown; total_value?: unknown };
    if (typeof row.name !== 'string') continue;
    const first = Array.isArray(row.values)
      ? (row.values[0] as { value?: unknown } | undefined)
      : undefined;
    const total = row.total_value as { value?: unknown } | undefined;
    const v = first?.value ?? total?.value;
    if (typeof v === 'number' && Number.isFinite(v) && v >= 0) out[row.name] = toInt(String(v), 0);
  }
  return out;
}

/** Likes, replies, reposts and quotes as a share of the views, in percent with one decimal ("3.4"); null with no views. */
export function engagementRate(m: Readonly<Record<string, number>>): string | null {
  const views = m.views ?? 0;
  if (views <= 0) return null;
  const actions = (m.likes ?? 0) + (m.replies ?? 0) + (m.reposts ?? 0) + (m.quotes ?? 0);
  return tenthsText(floorDiv(actions * 1000, views));
}
