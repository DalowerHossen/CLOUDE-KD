// path: services/cms/page-loader.ts
// Loads the content of a public page: the live version stored by the CMS, else the built-in content. A problem with
// the database or with stored content never takes a page down: the built-in content is shown and the problem is logged.
import 'server-only';
import { pageContentSchema, type Block } from '@/lib/cms/blocks';
import { DEFAULT_PAGES } from '@/lib/cms/defaults';
import { createLogger } from '@/lib/logger';
import { getAdminSupabase } from '@/lib/supabase/admin';

const log = createLogger({ component: 'cms-loader' });

export interface LoadedPage {
  slug: string;
  title: string;
  description: string;
  blocks: Block[];
  source: 'default' | 'cms';
  noindex: boolean;
  updatedAt: string | null;
}

export async function loadStoredPage(slug: string): Promise<LoadedPage | null> {
  const admin = getAdminSupabase();
  const page = await admin
    .from('cms_pages')
    .select('id, live_version_id, noindex')
    .eq('slug', slug)
    .is('deleted_at', null)
    .maybeSingle();
  if (page.error) throw page.error;
  if (!page.data?.live_version_id) return null;
  const version = await admin
    .from('cms_page_versions')
    .select('title, description, blocks, published_at')
    .eq('id', String(page.data.live_version_id))
    .eq('status', 'published')
    .is('deleted_at', null)
    .maybeSingle();
  if (version.error) throw version.error;
  if (!version.data) return null;
  const blocks = pageContentSchema.safeParse(version.data.blocks);
  if (!blocks.success) {
    log.error('stored page content is not valid; built-in content is shown', { slug });
    return null;
  }
  return {
    slug,
    title: String(version.data.title),
    description: String(version.data.description),
    blocks: blocks.data,
    source: 'cms',
    noindex: page.data.noindex === true,
    updatedAt: version.data.published_at ? String(version.data.published_at) : null,
  };
}

export async function loadPage(slug: string): Promise<LoadedPage | null> {
  try {
    const stored = await loadStoredPage(slug);
    if (stored) return stored;
  } catch (error) {
    log.error('stored page could not be read; built-in content is shown', { slug, error });
  }
  const def = DEFAULT_PAGES[slug];
  if (!def) return null;
  return {
    slug,
    title: def.title,
    description: def.description,
    blocks: pageContentSchema.parse(def.blocks),
    source: 'default',
    noindex: false,
    updatedAt: null,
  };
}
