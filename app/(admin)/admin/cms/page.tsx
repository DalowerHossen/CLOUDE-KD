// path: app/(admin)/admin/cms/page.tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import { DataTable, type DataColumn } from '@/components/shared/data-table';
import { PageHeader } from '@/components/shared/page-header';
import { ErrorState } from '@/components/shared/state-views';
import { Badge } from '@/components/ui/badge';
import { t } from '@/lib/i18n';
import { requirePagePermission } from '@/services/base/page-guard';
import { listPages, type PageListItem } from '@/services/cms/cms-service';
import { NewPageForm } from './_components/new-page-form';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Website pages' };

const columns: readonly DataColumn<PageListItem>[] = [
  {
    key: 'slug',
    header: t('s06Public.cms.colPage'),
    primary: true,
    cell: (r) => `/${r.slug === 'home' ? '' : r.slug}`,
  },
  { key: 'title', header: t('s06Public.cms.colTitle'), hideOnMobile: true, cell: (r) => r.title },
  {
    key: 'state',
    header: t('s06Public.cms.colState'),
    cell: (r) => <Badge variant="outline">{t(`s06Public.cms.states.${r.state}`)}</Badge>,
  },
  {
    key: 'edit',
    header: t('s06Public.cms.colAction'),
    cell: (r) => (
      <Link className="underline" href={`/admin/cms/${r.slug}`}>
        {t('s06Public.cms.edit')}
      </Link>
    ),
  },
];

export default async function AdminCmsPage(): Promise<JSX.Element> {
  await requirePagePermission('cms.read', 'platform', 'cms');
  let rows: PageListItem[] | null;
  try {
    rows = await listPages('page');
  } catch {
    rows = null;
  }
  return (
    <div className="space-y-sp-24">
      <PageHeader title={t('s06Public.cms.title')} description={t('s06Public.cms.description')} />
      {rows === null ? (
        <ErrorState description={t('s06Public.cms.loadError')} />
      ) : (
        <DataTable
          columns={columns}
          rows={rows}
          getRowId={(r) => r.slug}
          caption={t('s06Public.cms.title')}
        />
      )}
      <NewPageForm />
    </div>
  );
}
