// path: app/(public)/blog/archive/[month]/page.tsx
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { BlogList } from '@/components/marketing/blog/blog-list';
import { t } from '@/lib/i18n';
import { listPublished } from '@/services/blog/public';
import { publicListQuery } from '@/services/blog/schemas';

interface Props {
  params: Promise<{ month: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}

const label = (m: string): string =>
  new Date(`${m}-01T00:00:00Z`).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  });

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const month = (await params).month;
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) notFound();
  return {
    title: t('s06Public.blog.archiveTitle', { month: label(month) }),
    description: t('s06Public.blog.archiveDescription', { month: label(month) }),
    alternates: { canonical: `/blog/archive/${month}` },
    robots: { index: false, follow: true },
  };
}

export default async function ArchivePage({ params, searchParams }: Props): Promise<JSX.Element> {
  const month = (await params).month;
  const parsed = publicListQuery.safeParse({ page: (await searchParams).page, month });
  if (!parsed.success) notFound();
  const result = await listPublished(parsed.data).catch(() => ({
    posts: [],
    total: 0,
    pages: 0,
    featured: null,
  }));
  return (
    <BlogList
      title={t('s06Public.blog.archiveTitle', { month: label(month) })}
      featured={null}
      posts={result.posts}
      pages={result.pages}
      page={parsed.data.page}
      basePath={`/blog/archive/${month}`}
    />
  );
}
