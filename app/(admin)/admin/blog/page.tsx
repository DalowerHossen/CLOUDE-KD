// path: app/(admin)/admin/blog/page.tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import { DataTable, type DataColumn } from '@/components/shared/data-table';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState, ErrorState } from '@/components/shared/state-views';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { t } from '@/lib/i18n';
import { requirePagePermission } from '@/services/base/page-guard';
import { listPosts, taxonomy, type PostRow, type Taxonomy } from '@/services/blog/admin';
import { TaxonomyManager } from './_components/taxonomy-manager';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Blog' };

const columns: readonly DataColumn<PostRow>[] = [
  { key: 'title', header: t('s06Public.blogAdmin.postTitle'), primary: true, cell: (r) => r.title },
  {
    key: 'status',
    header: t('s06Public.cms.colState'),
    cell: (r) => <Badge variant="outline">{r.status}</Badge>,
  },
  {
    key: 'views',
    header: t('s06Public.blogAdmin.viewsColumn'),
    hideOnMobile: true,
    cell: (r) => r.viewCount,
  },
  {
    key: 'edit',
    header: t('s06Public.cms.colAction'),
    cell: (r) => (
      <Link className="underline" href={`/admin/blog/${r.id}`}>
        {t('s06Public.cms.edit')}
      </Link>
    ),
  },
];

export default async function AdminBlogPage(): Promise<JSX.Element> {
  await requirePagePermission('blog.read', 'platform', 'blog');
  let data: { posts: PostRow[]; tax: Taxonomy } | null;
  try {
    data = { posts: await listPosts(), tax: await taxonomy() };
  } catch {
    data = null;
  }
  return (
    <div className="space-y-sp-24">
      <PageHeader
        title={t('s06Public.blogAdmin.title')}
        description={t('s06Public.blogAdmin.description')}
        actions={
          <Button asChild>
            <Link href="/admin/blog/new">{t('s06Public.blogAdmin.newPost')}</Link>
          </Button>
        }
      />
      {data === null ? (
        <ErrorState description={t('s06Public.cms.loadError')} />
      ) : (
        <>
          <DataTable
            columns={columns}
            rows={data.posts}
            getRowId={(r) => r.id}
            caption={t('s06Public.blogAdmin.title')}
            empty={<EmptyState title={t('s06Public.blogAdmin.empty')} />}
          />
          <div className="grid gap-sp-24 lg:grid-cols-3">
            <TaxonomyManager
              kind="author"
              title={t('s06Public.blogAdmin.authors')}
              entries={data.tax.authors}
            />
            <TaxonomyManager
              kind="category"
              title={t('s06Public.blogAdmin.categories')}
              entries={data.tax.categories}
            />
            <TaxonomyManager
              kind="tag"
              title={t('s06Public.blogAdmin.tags')}
              entries={data.tax.tags}
            />
          </div>
        </>
      )}
    </div>
  );
}
