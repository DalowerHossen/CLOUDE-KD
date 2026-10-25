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

const KINDS = ['page', 'legal', 'help'] as const;
type Kind = (typeof KINDS)[number];
const TITLE: Record<Kind, 'tabPages' | 'tabLegal' | 'tabHelp'> = {
  page: 'tabPages',
  legal: 'tabLegal',
  help: 'tabHelp',
};

async function load(kind: Kind): Promise<PageListItem[] | null> {
  try {
    return await listPages(kind);
  } catch {
    return null;
  }
}

/** Site pages, legal and policy pages and help articles are all shown here, one section each, so none is hidden behind a tab. */
export default async function AdminCmsPage(): Promise<JSX.Element> {
  await requirePagePermission('cms.read', 'platform', 'cms');
  const lists = await Promise.all(KINDS.map(load));
  return (
    <div className="space-y-sp-24">
      <PageHeader title={t('s06Public.cms.title')} description={t('s06Public.cms.description')} />
      <nav className="flex flex-wrap gap-sp-12 text-sm" aria-label={t('s06Public.cms.title')}>
        {KINDS.map((k) => (
          <a key={k} className="underline" href={`#cms-${k}`}>
            {t(`s06Public.cms.${TITLE[k]}`)}
          </a>
        ))}
      </nav>
      {KINDS.map((kind, i) => {
        const rows = lists[i] ?? null;
        return (
          <section key={kind} id={`cms-${kind}`} className="space-y-sp-12">
            <h2 className="text-h3 font-semibold">{t(`s06Public.cms.${TITLE[kind]}`)}</h2>
            {rows === null ? (
              <ErrorState description={t('s06Public.cms.loadError')} />
            ) : (
              <DataTable
                columns={columns}
                rows={rows}
                getRowId={(r) => r.slug}
                caption={t(`s06Public.cms.${TITLE[kind]}`)}
              />
            )}
            {kind !== 'legal' ? <NewPageForm kind={kind} /> : null}
          </section>
        );
      })}
    </div>
  );
}
