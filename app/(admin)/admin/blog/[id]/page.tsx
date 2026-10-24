// path: app/(admin)/admin/blog/[id]/page.tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/shared/page-header';
import { Alert } from '@/components/ui/alert';
import { t } from '@/lib/i18n';
import { requirePagePermission } from '@/services/base/page-guard';
import { getPost, taxonomy } from '@/services/blog/admin';
import { StepUpForm } from '../../account-locks/_components/step-up-form';
import { PostEditor } from '../_components/post-editor';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Edit post' };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function EditPostPage({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<JSX.Element> {
  const actor = await requirePagePermission('blog.edit', 'platform', 'blog');
  const id = (await params).id;
  if (id !== 'new' && !UUID.test(id)) notFound();
  const [detail, tax] = await Promise.all([getPost(actor, id === 'new' ? null : id), taxonomy()]);
  return (
    <div className="space-y-sp-24">
      <PageHeader
        title={detail.post ? detail.post.title : t('s06Public.blogAdmin.newPost')}
        actions={
          <Link className="underline" href="/admin/blog">
            {t('s06Public.blogAdmin.title')}
          </Link>
        }
      />
      <StepUpForm />
      {tax.authors.length === 0 ? (
        <Alert>{t('s06Public.blogAdmin.needAuthor')}</Alert>
      ) : (
        <PostEditor
          key={`${detail.post?.id ?? 'new'}-${detail.post?.version ?? 0}`}
          post={detail.post}
          tagIds={detail.tagIds}
          authors={tax.authors.map((a) => ({ id: a.id, name: a.name }))}
          categories={tax.categories.map((c) => ({ id: c.id, name: c.name }))}
          tags={tax.tags.map((x) => ({ id: x.id, name: x.name }))}
          history={detail.history}
          canPublishDirect={detail.canPublishDirect}
        />
      )}
    </div>
  );
}
