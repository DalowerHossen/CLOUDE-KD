// path: services/branding/platform.ts
// Reads and writes the platform brand (stored as the `brand` row of seo_settings). A read never fails a page:
// problems return the built-in brand.
import 'server-only';
import { revalidatePath } from 'next/cache';
import { getService } from '@/lib/container';
import { InternalError } from '@/lib/errors';
import { createLogger } from '@/lib/logger';
import {
  DEFAULT_PLATFORM_BRAND,
  platformBrandSchema,
  type PlatformBrand,
} from '@/lib/brand/platform';
import { getAdminSupabase } from '@/lib/supabase/admin';
import type { Actor } from '@/types/contracts';

const log = createLogger({ component: 'platform-brand' });
const KEY = 'brand';

export async function readPlatformBrand(): Promise<PlatformBrand> {
  try {
    const { data, error } = await getAdminSupabase()
      .from('seo_settings')
      .select('value')
      .eq('key', KEY)
      .is('deleted_at', null)
      .maybeSingle();
    if (error) throw error;
    if (!data) return DEFAULT_PLATFORM_BRAND;
    const parsed = platformBrandSchema.safeParse({
      ...DEFAULT_PLATFORM_BRAND,
      ...(data.value as Record<string, unknown>),
    });
    return parsed.success ? parsed.data : DEFAULT_PLATFORM_BRAND;
  } catch (error) {
    log.error('platform brand could not be read', { error });
    return DEFAULT_PLATFORM_BRAND;
  }
}

export async function savePlatformBrand(
  actor: Actor,
  input: PlatformBrand,
): Promise<PlatformBrand> {
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
    action: 'brand.platform_saved',
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
