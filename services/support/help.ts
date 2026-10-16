// path: services/support/help.ts
// The help center list: built-in articles plus articles staff added or edited in the CMS (kind "help").
import 'server-only';
import { HELP_CATEGORIES, HELP_PAGES } from '@/lib/cms/defaults';
import { createLogger } from '@/lib/logger';
import { getAdminSupabase } from '@/lib/supabase/admin';

const log = createLogger({ component: 'help' });

export interface HelpArticle {
  slug: string;
  category: string;
  title: string;
  description: string;
}

const categoryOf = (slug: string): string => slug.split('/')[1] ?? 'getting-started';

export async function listHelpArticles(): Promise<HelpArticle[]> {
  const map = new Map<string, HelpArticle>();
  for (const p of Object.values(HELP_PAGES))
    map.set(p.slug, {
      slug: p.slug,
      category: categoryOf(p.slug),
      title: p.title,
      description: p.description,
    });
  try {
    const admin = getAdminSupabase();
    const pages = await admin
      .from('cms_pages')
      .select('slug, live_version_id')
      .eq('kind', 'help')
      .not('live_version_id', 'is', null)
      .is('deleted_at', null)
      .limit(500);
    if (pages.error) throw pages.error;
    const ids = (pages.data ?? []).map((p) => String(p.live_version_id));
    if (ids.length > 0) {
      const versions = await admin
        .from('cms_page_versions')
        .select('id, title, description')
        .in('id', ids)
        .eq('status', 'published');
      if (versions.error) throw versions.error;
      for (const p of pages.data ?? []) {
        const v = (versions.data ?? []).find((x) => String(x.id) === String(p.live_version_id));
        if (!v) continue;
        const slug = String(p.slug);
        map.set(slug, {
          slug,
          category: categoryOf(slug),
          title: String(v.title),
          description: String(v.description),
        });
      }
    }
  } catch (error) {
    log.error('stored help articles could not be read; built-in articles are shown', { error });
  }
  return [...map.values()].sort((a, b) => (a.title < b.title ? -1 : 1));
}

export function groupByCategory(
  articles: readonly HelpArticle[],
): { key: string; name: string; text: string; articles: HelpArticle[] }[] {
  const known = HELP_CATEGORIES.map((c) => ({
    ...c,
    articles: articles.filter((a) => a.category === c.key),
  }));
  const other = articles.filter((a) => !HELP_CATEGORIES.some((c) => c.key === a.category));
  return [
    ...known,
    ...(other.length > 0
      ? [{ key: 'other', name: 'More articles', text: '', articles: other }]
      : []),
  ].filter((c) => c.articles.length > 0);
}
