// path: app/(admin)/admin/cms/[...slug]/page.tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/shared/page-header';
import { t } from '@/lib/i18n';
import { requirePagePermission } from '@/services/base/page-guard';
import { editorData } from '@/services/cms/cms-service';
import { StepUpForm } from '../../account-locks/_components/step-up-form';
import { PageEditor } from '../_components/page-editor';
import type { Json } from '../_components/field-editor';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Edit page' };

const SLUG = /^[a-z0-9]([a-z0-9-]{0,60}[a-z0-9])?(\/[a-z0-9]([a-z0-9-]{0,60}[a-z0-9])?){0,2}$/;

export default async function EditCmsPage({
  params,
}: {
  params: Promise<{ slug: string[] }>;
}): Promise<JSX.Element> {
  const actor = await requirePagePermission('cms.edit', 'platform', 'cms');
  const slug = (await params).slug.map(decodeURIComponent).join('/');
  if (!SLUG.test(slug)) notFound();
  const kind = slug.startsWith('legal/') ? 'legal' : 'page';
  const data = await editorData(actor, slug, kind);
  return (
    <div className="space-y-sp-24">
      <PageHeader
        title={t('s06Public.cms.editorTitle', { slug })}
        actions={
          <Link className="underline" href="/admin/cms">
            {t('s06Public.cms.title')}
          </Link>
        }
      />
      <StepUpForm />
      <PageEditor
        key={`${data.slug}-${data.open?.id ?? 'none'}-${data.versions[0]?.id ?? 'none'}`}
        slug={data.slug}
        kind={kind}
        initial={{
          title: data.title,
          description: data.description,
          blocks: data.blocks as Json[],
        }}
        basedOn={data.basedOn}
        open={
          data.open
            ? {
                id: data.open.id,
                versionNo: data.open.version_no,
                status: data.open.status,
                publishAt: data.open.publish_at,
                publishedAt: data.open.published_at,
                note: data.open.note,
                createdAt: data.open.created_at,
              }
            : null
        }
        versions={data.versions.map((v) => ({
          id: v.id,
          versionNo: v.version_no,
          status: v.status,
          publishAt: v.publish_at,
          publishedAt: v.published_at,
          note: v.note,
          createdAt: v.created_at,
        }))}
        noindex={data.noindex}
        canPublishDirect={data.canPublishDirect}
      />
    </div>
  );
}
