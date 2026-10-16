// path: components/marketing/blog/blog-list.tsx
import Link from 'next/link';
import { SITE_NAME } from '@/config/seo';
import { siteUrl } from '@/lib/cms/site-url';
import { t } from '@/lib/i18n';
import { breadcrumbs, itemList } from '@/lib/seo/jsonld';
import { JsonLd } from '../json-ld';
import { archiveMonths, categoryList, type PostCard as Card } from '@/services/blog/public';
import { Illustration } from '../art/illustrations';
import { PostCard } from './post-card';

interface Props {
  title: string;
  intro?: string;
  featured: Card | null;
  posts: Card[];
  pages: number;
  page: number;
  /** Base path for the pagination links, without query. */
  basePath: string;
  q?: string;
}

const monthLabel = (m: string): string =>
  new Date(`${m}-01T00:00:00Z`).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  });

export async function BlogList({
  title,
  intro,
  featured,
  posts,
  pages,
  page,
  basePath,
  q,
}: Props): Promise<JSX.Element> {
  const [categories, months] = await Promise.all([
    categoryList().catch(() => []),
    archiveMonths().catch(() => []),
  ]);
  const href = (p: number): string => {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (p > 1) params.set('page', String(p));
    const text = params.toString();
    return text ? `${basePath}?${text}` : basePath;
  };
  const origin = siteUrl();
  const listed = featured ? [featured, ...posts] : posts;
  return (
    <div className="mx-auto w-full max-w-7xl px-sp-16 py-sp-48">
      <JsonLd
        data={[
          breadcrumbs(origin, [
            { name: SITE_NAME, path: '/' },
            { name: t('s06Public.blog.title'), path: '/blog' },
          ]),
          itemList(
            origin,
            listed.map((p) => ({ name: p.title, path: `/blog/${p.slug}` })),
          ),
        ]}
      />
      <h1 className="text-h1 font-semibold tracking-tight">{title}</h1>
      {intro ? <p className="mt-sp-12 max-w-3xl text-lg text-muted-foreground">{intro}</p> : null}
      <div className="mt-sp-24 flex flex-wrap items-center gap-sp-12">
        <form action="/blog" role="search" className="flex gap-2">
          <label className="sr-only" htmlFor="blog-q">
            {t('s06Public.blog.search')}
          </label>
          <input
            id="blog-q"
            name="q"
            defaultValue={q ?? ''}
            minLength={2}
            maxLength={80}
            placeholder={t('s06Public.blog.search')}
            className="h-10 rounded-md border bg-background px-3 text-sm"
          />
          <button type="submit" className="h-10 rounded-md border px-3 text-sm">
            {t('s06Public.blog.searchButton')}
          </button>
        </form>
        <nav aria-label={t('s06Public.blog.categories')} className="flex flex-wrap gap-2 text-sm">
          <Link className="rounded-full border px-3 py-1" href="/blog">
            {t('s06Public.blog.all')}
          </Link>
          {categories.map((c) => (
            <Link
              key={c.slug}
              className="rounded-full border px-3 py-1"
              href={`/blog/category/${c.slug}`}
            >
              {c.name}
            </Link>
          ))}
        </nav>
      </div>
      {featured ? (
        <div className="mt-sp-32">
          <PostCard post={featured} large />
        </div>
      ) : null}
      {posts.length === 0 && !featured ? (
        <div className="mt-sp-32 flex flex-col items-center gap-3 text-center text-muted-foreground">
          <Illustration kind="empty" />
          <p>{t('s06Public.blog.empty')}</p>
        </div>
      ) : (
        <div className="mt-sp-32 grid gap-sp-24 sm:grid-cols-2 lg:grid-cols-3">
          {posts.map((p) => (
            <PostCard key={p.slug} post={p} />
          ))}
        </div>
      )}
      {pages > 1 ? (
        <nav
          aria-label={t('s06Public.blog.pages')}
          className="mt-sp-32 flex items-center gap-sp-12 text-sm"
        >
          {page > 1 ? (
            <Link rel="prev" className="underline" href={href(page - 1)}>
              {t('s06Public.blog.newer')}
            </Link>
          ) : null}
          <span>{t('s06Public.blog.pageOf', { page, pages })}</span>
          {page < pages ? (
            <Link rel="next" className="underline" href={href(page + 1)}>
              {t('s06Public.blog.older')}
            </Link>
          ) : null}
        </nav>
      ) : null}
      {months.length > 0 ? (
        <nav aria-label={t('s06Public.blog.archive')} className="mt-sp-48">
          <h2 className="text-h4 font-semibold">{t('s06Public.blog.archive')}</h2>
          <ul className="mt-sp-12 flex flex-wrap gap-sp-12 text-sm">
            {months.slice(0, 24).map((m) => (
              <li key={m.month}>
                <Link className="underline" href={`/blog/archive/${m.month}`}>
                  {monthLabel(m.month)} ({m.count})
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      ) : null}
      <p className="mt-sp-32 text-sm">
        <Link className="underline" href="/blog/rss.xml">
          {t('s06Public.blog.feed')}
        </Link>
      </p>
    </div>
  );
}
