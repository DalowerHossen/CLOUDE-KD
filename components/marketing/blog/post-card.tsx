// path: components/marketing/blog/post-card.tsx
import Link from 'next/link';
import { t } from '@/lib/i18n';
import type { PostCard as Card } from '@/services/blog/public';

export const formatDay = (iso: string): string =>
  new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  });

export function PostCard({ post, large = false }: { post: Card; large?: boolean }): JSX.Element {
  return (
    <article
      className={`overflow-hidden rounded-lg border bg-card ${large ? 'md:grid md:grid-cols-2' : ''}`}
    >
      {post.coverFileId ? (
        <Link href={`/blog/${post.slug}`} tabIndex={-1} aria-hidden="true">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/api/cms/media/${post.coverFileId}`}
            alt={post.coverAlt}
            loading="lazy"
            className="aspect-[16/9] w-full object-cover"
          />
        </Link>
      ) : null}
      <div className="space-y-2 p-sp-16">
        {post.categoryName && post.categorySlug ? (
          <Link
            href={`/blog/category/${post.categorySlug}`}
            className="text-caption font-medium uppercase tracking-wide text-primary"
          >
            {post.categoryName}
          </Link>
        ) : null}
        <h2 className={large ? 'text-h2 font-semibold' : 'text-h4 font-semibold'}>
          <Link href={`/blog/${post.slug}`} className="hover:underline">
            {post.title}
          </Link>
        </h2>
        {post.excerpt ? <p className="text-muted-foreground">{post.excerpt}</p> : null}
        <p className="text-caption text-muted-foreground">
          {post.authorName} - <time dateTime={post.publishedAt}>{formatDay(post.publishedAt)}</time>{' '}
          - {t('s06Public.blog.readTime', { minutes: post.readMinutes })}
        </p>
      </div>
    </article>
  );
}
