// path: app/sitemap.ts
// The sitemap lists indexable public pages only: no product, admin, token or API address, and no page marked hidden.
import type { MetadataRoute } from 'next';
import { absoluteUrl } from '@/lib/cms/site-url';
import { indexablePages } from '@/services/seo/pages';

export const dynamic = 'force-dynamic';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const pages = await indexablePages();
  return pages.map((p) => ({
    url: absoluteUrl(p.path),
    ...(p.lastModified ? { lastModified: new Date(p.lastModified) } : {}),
    changeFrequency:
      p.kind === 'blog' ? 'monthly' : p.path === '/' || p.path === '/blog' ? 'weekly' : 'monthly',
    priority: p.path === '/' ? 1 : p.kind === 'blog' ? 0.6 : p.kind === 'legal' ? 0.3 : 0.8,
  }));
}
