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

export default async function AdminCmsPage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string }>;
}): Promise<JSX.Element> {
  await requirePagePermission('cms.read', 'platform', 'cms');
  const kind = (await searchParams).kind === 'legal' ? 'legal' : 'page';
  let rows: PageListItem[] | null;
  try {
    rows = await listPages(kind);
  } catch {
    rows = null;
  }
  return (
    <div className="space-y-sp-24">
      <PageHeader title={t('s06Public.cms.title')} description={t('s06Public.cms.description')} />
      <nav className="flex gap-sp-12 text-sm" aria-label={t('s06Public.cms.title')}>
        <Link
          className={kind === 'page' ? 'font-semibold underline' : 'underline'}
          href="/admin/cms"
        >
          {t('s06Public.cms.tabPages')}
        </Link>
        <Link
          className={kind === 'legal' ? 'font-semibold underline' : 'underline'}
          href="/admin/cms?kind=legal"
        >
          {t('s06Public.cms.tabLegal')}
        </Link>
      </nav>
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
      {kind === 'page' ? <NewPageForm /> : null}
    </div>
  );
}
