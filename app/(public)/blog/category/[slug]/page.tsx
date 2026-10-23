// path: app/(public)/blog/category/[slug]/page.tsx
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { BlogList } from '@/components/marketing/blog/blog-list';
import { t } from '@/lib/i18n';
import { categoryList, listPublished } from '@/services/blog/public';
import { publicListQuery, slugSchema } from '@/services/blog/schemas';

interface Props {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}

async function category(
  slug: string,
): Promise<{ slug: string; name: string; description: string }> {
  if (!slugSchema.safeParse(slug).success) notFound();
  const found = (await categoryList().catch(() => [])).find((c) => c.slug === slug);
  if (!found) notFound();
  return found;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const c = await category((await params).slug);
  return {
    title: t('s06Public.blog.categoryTitle', { name: c.name }),
    description: c.description || t('s06Public.blog.categoryDescription', { name: c.name }),
    alternates: { canonical: `/blog/category/${c.slug}` },
  };
}

export default async function CategoryPage({ params, searchParams }: Props): Promise<JSX.Element> {
  const c = await category((await params).slug);
  const page = publicListQuery.safeParse({ page: (await searchParams).page, category: c.slug });
  const query = page.success ? page.data : { page: 1, category: c.slug };
  const result = await listPublished(query).catch(() => ({
    posts: [],
    total: 0,
    pages: 0,
    featured: null,
  }));
  return (
    <BlogList
      title={c.name}
      intro={c.description}
      featured={null}
      posts={result.posts}
      pages={result.pages}
      page={query.page ?? 1}
      basePath={`/blog/category/${c.slug}`}
    />
  );
}
