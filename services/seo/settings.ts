// path: services/seo/settings.ts
// Reads and writes the site-wide search settings. A read never fails a page: problems return the empty settings.
import 'server-only';
import { revalidatePath } from 'next/cache';
import { getService } from '@/lib/container';
import { InternalError } from '@/lib/errors';
import { createLogger } from '@/lib/logger';
import { EMPTY_SEO_SETTINGS, seoSettingsSchema, type SeoSettings } from '@/lib/seo/settings';
import { getAdminSupabase } from '@/lib/supabase/admin';
import type { Actor } from '@/types/contracts';

const log = createLogger({ component: 'seo' });
const KEY = 'site';

export async function readSeoSettings(): Promise<SeoSettings> {
  try {
    const { data, error } = await getAdminSupabase()
      .from('seo_settings')
      .select('value')
      .eq('key', KEY)
      .is('deleted_at', null)
      .maybeSingle();
    if (error) throw error;
    if (!data) return EMPTY_SEO_SETTINGS;
    const parsed = seoSettingsSchema.safeParse({
      ...EMPTY_SEO_SETTINGS,
      ...(data.value as Record<string, unknown>),
    });
    return parsed.success ? parsed.data : EMPTY_SEO_SETTINGS;
  } catch (error) {
    log.error('search settings could not be read', { error });
    return EMPTY_SEO_SETTINGS;
  }
}

export async function saveSeoSettings(actor: Actor, input: SeoSettings): Promise<SeoSettings> {
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
    action: 'seo.settings_saved',
    resourceType: 'seo_settings',
    resourceId: null,
    companyId: null,
    metadata: { by: actor.userId },
  });
  try {
    revalidatePath('/', 'layout');
  } catch {
    // Outside a request there is nothing to refresh; pages refresh by time as well.
  }
  return input;
}
