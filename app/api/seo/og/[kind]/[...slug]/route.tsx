// path: app/api/seo/og/[kind]/[...slug]/route.tsx
// Share image of a public page or blog post (1200 by 630). The text comes from the stored title, never from the
// address, so nobody can make the site print text of their choice. A plain handler because the answer is an image.
import { ImageResponse } from 'next/og';
import { SITE_NAME } from '@/config/seo';
import { NotFoundError, errorResponse, normalizeError } from '@/lib/errors';
import { resolveCorrelationId } from '@/lib/logger/correlation';
import { getPublishedPost } from '@/services/blog/public';
import { slugSchema } from '@/services/blog/schemas';
import { loadPage } from '@/services/cms/page-loader';

export const dynamic = 'force-dynamic';

async function titleOf(kind: string, slug: string): Promise<{ title: string; label: string }> {
  if (kind === 'page') {
    const page = await loadPage(slug);
    if (page) return { title: page.title, label: SITE_NAME };
  } else if (kind === 'post' && slugSchema.safeParse(slug).success) {
    const post = await getPublishedPost(slug).catch(() => null);
    if (post) return { title: post.title, label: `${SITE_NAME} blog` };
  }
  throw new NotFoundError();
}

export async function GET(
  request: Request,
  context: { params: Promise<{ kind: string; slug: string[] }> },
): Promise<Response> {
  const correlationId = resolveCorrelationId(request.headers.get('x-correlation-id'));
  try {
    const { kind, slug } = await context.params;
    const { title, label } = await titleOf(kind, slug.join('/'));
    const size = title.length > 70 ? 56 : 72;
    return new ImageResponse(
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: 72,
          background: '#0f172a',
          color: '#ffffff',
        }}
      >
        <div style={{ fontSize: 32, color: '#93c5fd', display: 'flex' }}>{label}</div>
        <div style={{ fontSize: size, fontWeight: 700, lineHeight: 1.15, display: 'flex' }}>
          {title}
        </div>
        <div style={{ fontSize: 28, color: '#cbd5e1', display: 'flex' }}>
          Invoicing, payments, payroll and accounting
        </div>
      </div>,
      {
        width: 1200,
        height: 630,
        headers: { 'cache-control': 'public, max-age=3600, s-maxage=86400' },
      },
    );
  } catch (thrown) {
    return errorResponse(normalizeError(thrown), correlationId);
  }
}
