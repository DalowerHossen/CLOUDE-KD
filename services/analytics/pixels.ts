// path: services/analytics/pixels.ts
// Identifiers of the tracking providers (stored in seo_settings under the key "pixels"), the first-party counters and
// the server-side Meta event. A read never fails a page.
import 'server-only';
import { revalidatePath } from 'next/cache';
import { getService } from '@/lib/container';
import { getServerEnv } from '@/lib/env';
import { InternalError } from '@/lib/errors';
import { createLogger } from '@/lib/logger';
import {
  EMPTY_PIXELS,
  pixelSettingsSchema,
  type PixelSettings,
  type SiteEvent,
} from '@/lib/analytics/providers';
import { PRIVATE_PREFIXES } from '@/config/seo';
import { getAdminSupabase } from '@/lib/supabase/admin';
import type { Actor } from '@/types/contracts';

const log = createLogger({ component: 'analytics' });
const KEY = 'pixels';
const GRAPH_VERSION = 'v21.0';

export async function readPixels(): Promise<PixelSettings> {
  try {
    const { data, error } = await getAdminSupabase()
      .from('seo_settings')
      .select('value')
      .eq('key', KEY)
      .is('deleted_at', null)
      .maybeSingle();
    if (error) throw error;
    if (!data) return EMPTY_PIXELS;
    const parsed = pixelSettingsSchema.safeParse({
      ...EMPTY_PIXELS,
      ...(data.value as Record<string, unknown>),
    });
    return parsed.success ? parsed.data : EMPTY_PIXELS;
  } catch (error) {
    log.error('pixel settings could not be read', { error });
    return EMPTY_PIXELS;
  }
}

export async function savePixels(actor: Actor, input: PixelSettings): Promise<PixelSettings> {
  const admin = getAdminSupabase();
  const existing = await admin
    .from('seo_settings')
    .select('id')
    .eq('key', KEY)
    .is('deleted_at', null)
    .maybeSingle();
  if (existing.error) throw new InternalError(existing.error);
  const r = existing.data
    ? await admin.from('seo_settings').update({ value: input }).eq('id', String(existing.data.id))
    : await admin.from('seo_settings').insert({ key: KEY, value: input });
  if (r.error) throw new InternalError(r.error);
  await getService('audit').record({
    action: 'analytics.pixels_saved',
    resourceType: 'seo_settings',
    resourceId: null,
    companyId: null,
    metadata: {
      by: actor.userId,
      active: Object.entries(input)
        .filter(([, v]) => v !== '')
        .map(([k]) => k),
    },
  });
  try {
    revalidatePath('/', 'layout');
  } catch {
    // Outside a request there is nothing to refresh; pages refresh by time as well.
  }
  return input;
}

/** Counts one event of a public page. Private addresses are never counted. */
export async function countHit(path: string, event: SiteEvent): Promise<boolean> {
  if (PRIVATE_PREFIXES.some((p) => path === p || path.startsWith(p))) return false;
  const { error } = await getAdminSupabase().rpc('kd_analytics_hit', {
    p_path: path,
    p_event: event,
  });
  if (error) throw new InternalError(error);
  return true;
}

export interface AnalyticsSummary {
  days: number;
  totals: Record<string, number>;
  daily: { day: string; pageViews: number }[];
  topPages: { path: string; hits: number }[];
}

export async function summary(days: number): Promise<AnalyticsSummary> {
  const since = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
  const { data, error } = await getAdminSupabase()
    .from('analytics_daily')
    .select('day, path, event, hit_count')
    .gte('day', since)
    .is('deleted_at', null)
    .limit(20000);
  if (error) throw new InternalError(error);
  const totals: Record<string, number> = {};
  const byDay = new Map<string, number>();
  const byPage = new Map<string, number>();
  for (const r of data ?? []) {
    const n = Number(r.hit_count);
    const event = String(r.event);
    totals[event] = (totals[event] ?? 0) + n;
    if (event === 'page_view') {
      byDay.set(String(r.day), (byDay.get(String(r.day)) ?? 0) + n);
      byPage.set(String(r.path), (byPage.get(String(r.path)) ?? 0) + n);
    }
  }
  return {
    days,
    totals,
    daily: [...byDay.entries()]
      .sort((a, b) => (a[0] < b[0] ? -1 : 1))
      .map(([day, pageViews]) => ({ day, pageViews })),
    topPages: [...byPage.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15)
      .map(([path, hits]) => ({ path, hits })),
  };
}

/** Sends one conversion to the Meta conversions API. The caller has already checked marketing consent. */
export async function sendMetaEvent(input: {
  event: 'Lead' | 'CompleteRegistration';
  eventId: string;
  url: string;
  userAgent: string | null;
}): Promise<boolean> {
  const pixels = await readPixels();
  const token = getServerEnv().META_CAPI_ACCESS_TOKEN;
  if (!pixels.metaPixel || !token) return false;
  const response = await fetch(
    `https://graph.facebook.com/${GRAPH_VERSION}/${encodeURIComponent(pixels.metaPixel)}/events`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({
        data: [
          {
            event_name: input.event,
            event_time: Math.floor(Date.now() / 1000),
            event_id: input.eventId,
            action_source: 'website',
            event_source_url: input.url,
            user_data: input.userAgent ? { client_user_agent: input.userAgent } : {},
          },
        ],
      }),
      signal: AbortSignal.timeout(5000),
    },
  ).catch((error: unknown) => {
    log.warn('meta event not sent', { error: error instanceof Error ? error.message : 'failed' });
    return null;
  });
  return response?.ok === true;
}
