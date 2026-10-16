// path: app/(public)/blog/tag/[slug]/page.tsx
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { BlogList } from '@/components/marketing/blog/blog-list';
import { t } from '@/lib/i18n';
import { listPublished } from '@/services/blog/public';
import { publicListQuery, slugSchema } from '@/services/blog/schemas';

interface Props {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const slug = (await params).slug;
  if (!slugSchema.safeParse(slug).success) notFound();
  return {
    title: t('s06Public.blog.tagTitle', { name: slug }),
    description: t('s06Public.blog.categoryDescription', { name: slug }),
    alternates: { canonical: `/blog/tag/${slug}` },
    robots: { index: false, follow: true },
  };
}

export default async function TagPage({ params, searchParams }: Props): Promise<JSX.Element> {
  const slug = (await params).slug;
  if (!slugSchema.safeParse(slug).success) notFound();
  const page = publicListQuery.safeParse({ page: (await searchParams).page, tag: slug });
  const query = page.success ? page.data : { page: 1, tag: slug };
  const result = await listPublished(query).catch(() => ({
    posts: [],
    total: 0,
    pages: 0,
    featured: null,
  }));
  if (result.total === 0) notFound();
  return (
    <BlogList
      title={t('s06Public.blog.tagTitle', { name: slug })}
      featured={null}
      posts={result.posts}
      pages={result.pages}
      page={query.page ?? 1}
      basePath={`/blog/tag/${slug}`}
    />
  );
}
