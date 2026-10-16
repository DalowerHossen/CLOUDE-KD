// path: services/seo/pages.ts
// The list of public pages that search engines may index, shared by the sitemap and the audit.
import 'server-only';
import { DEFAULT_PAGES, LEGAL_PAGES, pathOf } from '@/lib/cms/defaults';
import { InternalError } from '@/lib/errors';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { publishedSlugs } from '@/services/blog/public';

export interface IndexablePage {
  path: string;
  slug: string;
  kind: 'page' | 'legal' | 'blog' | 'blog_index';
  lastModified: string | null;
}

/** Slugs the CMS marks as hidden from search engines. */
async function hiddenSlugs(): Promise<Set<string>> {
  const { data, error } = await getAdminSupabase()
    .from('cms_pages')
    .select('slug')
    .eq('noindex', true)
    .is('deleted_at', null);
  if (error) throw new InternalError(error);
  return new Set((data ?? []).map((r) => String(r.slug)));
}

export async function indexablePages(): Promise<IndexablePage[]> {
  let hidden = new Set<string>();
  const modified = new Map<string, string>();
  const extra: string[] = [];
  try {
    hidden = await hiddenSlugs();
    const { data, error } = await getAdminSupabase()
      .from('cms_pages')
      .select('slug, kind, updated_at')
      .is('deleted_at', null)
      .eq('kind', 'page');
    if (error) throw error;
    for (const r of data ?? []) {
      modified.set(String(r.slug), String(r.updated_at));
      if (!(String(r.slug) in DEFAULT_PAGES) && String(r.slug) !== 'home')
        extra.push(String(r.slug));
    }
  } catch {
    // Without the database the built-in pages are still listed.
  }
  const pages: IndexablePage[] = [];
  for (const slug of [...Object.keys(DEFAULT_PAGES), ...extra]) {
    if (hidden.has(slug)) continue;
    pages.push({
      path: pathOf(slug),
      slug,
      kind: 'page',
      lastModified: modified.get(slug) ?? null,
    });
  }
  for (const slug of Object.keys(LEGAL_PAGES)) {
    if (hidden.has(slug)) continue;
    pages.push({
      path: pathOf(slug),
      slug,
      kind: 'legal',
      lastModified: modified.get(slug) ?? null,
    });
  }
  pages.push({ path: '/legal', slug: 'legal', kind: 'page', lastModified: null });
  for (const tool of [
    'tools',
    'tools/invoice-generator',
    'tools/late-fee-calculator',
    'tools/sales-tax-calculator',
  ])
    pages.push({ path: `/${tool}`, slug: tool, kind: 'page', lastModified: null });
  pages.push({ path: '/blog', slug: 'blog', kind: 'blog_index', lastModified: null });
  try {
    for (const p of await publishedSlugs())
      pages.push({
        path: `/blog/${p.slug}`,
        slug: p.slug,
        kind: 'blog',
        lastModified: p.updatedAt,
      });
  } catch {
    // Blog posts are left out when the database cannot be read.
  }
  return pages;
}
