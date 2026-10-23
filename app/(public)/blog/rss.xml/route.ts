// path: app/(public)/blog/rss.xml/route.ts
// The blog feed. A plain handler because the answer is XML, not JSON.
import { absoluteUrl } from '@/lib/cms/site-url';
import { feedPosts } from '@/services/blog/public';

export const dynamic = 'force-dynamic';

const esc = (v: string): string =>
  v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export async function GET(): Promise<Response> {
  const posts = await feedPosts().catch(() => []);
  const items = posts
    .map(
      (p) =>
        `<item><title>${esc(p.title)}</title><link>${esc(absoluteUrl(`/blog/${p.slug}`))}</link><guid isPermaLink="true">${esc(absoluteUrl(`/blog/${p.slug}`))}</guid><pubDate>${new Date(p.publishedAt).toUTCString()}</pubDate><description>${esc(p.excerpt)}</description>${p.categoryName ? `<category>${esc(p.categoryName)}</category>` : ''}</item>`,
    )
    .join('');
  const body = `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom"><channel><title>KD SOLUTION IT blog</title><link>${esc(absoluteUrl('/blog'))}</link><description>News, guides and updates from KD SOLUTION IT.</description><language>en</language><atom:link href="${esc(absoluteUrl('/blog/rss.xml'))}" rel="self" type="application/rss+xml"/>${items}</channel></rss>`;
  return new Response(body, {
    headers: {
      'content-type': 'application/rss+xml; charset=utf-8',
      'cache-control': 'public, max-age=600, s-maxage=600',
      'x-content-type-options': 'nosniff',
    },
  });
}
