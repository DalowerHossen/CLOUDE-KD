// path: app/(public)/blog/page.tsx
import type { Metadata } from 'next';
import { BlogList } from '@/components/marketing/blog/blog-list';
import { t } from '@/lib/i18n';
import { listPublished } from '@/services/blog/public';
import { publicListQuery } from '@/services/blog/schemas';

export const metadata: Metadata = {
  title: t('s06Public.blog.title'),
  description: t('s06Public.blog.description'),
  alternates: { canonical: '/blog', types: { 'application/rss+xml': '/blog/rss.xml' } },
};

export default async function BlogPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}): Promise<JSX.Element> {
  const raw = await searchParams;
  const parsed = publicListQuery.safeParse({ page: raw.page, q: raw.q || undefined });
  const query = parsed.success ? parsed.data : { page: 1 };
  const result = await listPublished(query).catch(() => ({
    posts: [],
    total: 0,
    pages: 0,
    featured: null,
  }));
  return (
    <BlogList
      title={t('s06Public.blog.title')}
      intro={t('s06Public.blog.description')}
      featured={result.featured}
      posts={result.posts}
      pages={result.pages}
      page={query.page ?? 1}
      basePath="/blog"
      q={'q' in query ? query.q : undefined}
    />
  );
}
