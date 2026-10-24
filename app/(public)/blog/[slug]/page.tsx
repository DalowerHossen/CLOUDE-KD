// path: app/(public)/blog/[slug]/page.tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { JsonLd } from '@/components/marketing/json-ld';
import { PostCard, formatDay } from '@/components/marketing/blog/post-card';
import { ViewCounter } from '@/components/marketing/blog/view-counter';
import { SafeHtml } from '@/components/shared/safe-html';
import { SITE_NAME } from '@/config/seo';
import { absoluteUrl, siteUrl } from '@/lib/cms/site-url';
import { article, breadcrumbs } from '@/lib/seo/jsonld';
import { t } from '@/lib/i18n';
import { getPublishedPost, relatedPosts } from '@/services/blog/public';
import { slugSchema } from '@/services/blog/schemas';

export const revalidate = 300;

interface Props {
  params: Promise<{ slug: string }>;
}

async function load(slug: string): ReturnType<typeof getPublishedPost> {
  if (!slugSchema.safeParse(slug).success) return null;
  return getPublishedPost(slug).catch(() => null);
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const post = await load((await params).slug);
  if (!post) return {};
  const title = post.seoTitle || post.title;
  const description = post.seoDescription || post.excerpt || post.title;
  const image = [
    post.coverFileId
      ? { url: `/api/cms/media/${post.coverFileId}`, alt: post.coverAlt || post.title }
      : { url: `/api/seo/og/post/${post.slug}`, width: 1200, height: 630, alt: post.title },
  ];
  return {
    title,
    description,
    alternates: { canonical: `/blog/${post.slug}` },
    openGraph: {
      type: 'article',
      title,
      description,
      url: `/blog/${post.slug}`,
      publishedTime: post.publishedAt,
      images: image,
    },
    twitter: { card: 'summary_large_image', title, description, images: [image[0]?.url ?? ''] },
  };
}

export default async function PostPage({ params }: Props): Promise<JSX.Element> {
  const post = await load((await params).slug);
  if (!post) notFound();
  const related = await relatedPosts(post).catch(() => []);
  const url = absoluteUrl(`/blog/${post.slug}`);
  const shares = [
    {
      name: 'X',
      href: `https://twitter.com/intent/tweet?url=${encodeURIComponent(url)}&text=${encodeURIComponent(post.title)}`,
    },
    {
      name: 'LinkedIn',
      href: `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`,
    },
    {
      name: 'Facebook',
      href: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`,
    },
    {
      name: 'E-mail',
      href: `mailto:?subject=${encodeURIComponent(post.title)}&body=${encodeURIComponent(url)}`,
    },
  ];
  return (
    <article className="mx-auto w-full max-w-3xl px-sp-16 py-sp-48">
      <JsonLd
        data={[
          article(siteUrl(), {
            slug: post.slug,
            title: post.title,
            description: post.seoDescription || post.excerpt || post.title,
            publishedAt: post.publishedAt,
            updatedAt: post.updatedAt,
            authorName: post.authorName,
            coverUrl: post.coverFileId ? absoluteUrl(`/api/cms/media/${post.coverFileId}`) : null,
          }),
          breadcrumbs(siteUrl(), [
            { name: SITE_NAME, path: '/' },
            { name: t('s06Public.blog.title'), path: '/blog' },
            { name: post.title, path: `/blog/${post.slug}` },
          ]),
        ]}
      />
      <ViewCounter slug={post.slug} />
      <header className="space-y-sp-12">
        {post.categoryName && post.categorySlug ? (
          <Link
            href={`/blog/category/${post.categorySlug}`}
            className="text-caption font-medium uppercase tracking-wide text-primary"
          >
            {post.categoryName}
          </Link>
        ) : null}
        <h1 className="text-h1 font-semibold tracking-tight">{post.title}</h1>
        <p className="text-sm text-muted-foreground">
          {post.authorName} - <time dateTime={post.publishedAt}>{formatDay(post.publishedAt)}</time>{' '}
          - {t('s06Public.blog.readTime', { minutes: post.readMinutes })}
        </p>
      </header>
      {post.coverFileId ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`/api/cms/media/${post.coverFileId}`}
          alt={post.coverAlt}
          className="mt-sp-24 w-full rounded-lg"
        />
      ) : null}
      <SafeHtml html={post.bodyHtml} className="prose-content mt-sp-24 space-y-sp-12" />
      {post.tags.length > 0 ? (
        <ul className="mt-sp-24 flex flex-wrap gap-2 text-sm" aria-label={t('s06Public.blog.tags')}>
          {post.tags.map((tag) => (
            <li key={tag.slug}>
              <Link className="rounded-full border px-3 py-1" href={`/blog/tag/${tag.slug}`}>
                {tag.name}
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
      <nav
        aria-label={t('s06Public.blog.share')}
        className="mt-sp-24 flex flex-wrap items-center gap-sp-12 text-sm"
      >
        <span className="font-medium">{t('s06Public.blog.share')}</span>
        {shares.map((s) => (
          <a
            key={s.name}
            className="underline"
            href={s.href}
            target="_blank"
            rel="noopener noreferrer"
          >
            {s.name}
          </a>
        ))}
      </nav>
      {post.authorBio ? (
        <aside className="mt-sp-32 rounded-lg border bg-muted/40 p-sp-16">
          <p className="font-medium">{post.authorName}</p>
          <p className="text-sm text-muted-foreground">{post.authorBio}</p>
        </aside>
      ) : null}
      {related.length > 0 ? (
        <section className="mt-sp-48" aria-labelledby="related-title">
          <h2 id="related-title" className="text-h3 font-semibold">
            {t('s06Public.blog.related')}
          </h2>
          <div className="mt-sp-16 grid gap-sp-16 sm:grid-cols-2">
            {related.map((p) => (
              <PostCard key={p.slug} post={p} />
            ))}
          </div>
        </section>
      ) : null}
    </article>
  );
}
