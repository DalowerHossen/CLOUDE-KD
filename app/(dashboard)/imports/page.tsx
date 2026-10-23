// path: app/(dashboard)/imports/page.tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import { ImportUpload } from '@/components/transfer/import-upload';
import { DataTable, type DataColumn } from '@/components/shared/data-table';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState, ErrorState } from '@/components/shared/state-views';
import { Badge } from '@/components/ui/badge';
import { getService } from '@/lib/container';
import { t, type StringKey } from '@/lib/i18n';
import { requirePagePermission } from '@/services/base/page-guard';
import { listImports, type ImportView } from '@/services/import/imports';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Imports' };

const columns: readonly DataColumn<ImportView>[] = [
  { key: 'file', header: t('s08Crm.transfer.fileName'), primary: true, cell: (r) => r.fileName },
  {
    key: 'target',
    header: t('s08Crm.transfer.target'),
    hideOnMobile: true,
    cell: (r) => t(`s08Crm.transfer.targets.${r.target}` as StringKey),
  },
  { key: 'rows', header: t('s08Crm.transfer.rows'), hideOnMobile: true, cell: (r) => r.total },
  {
    key: 'status',
    header: t('s08Crm.transfer.status'),
    cell: (r) => (
      <Badge variant="outline">{t(`s08Crm.transfer.statuses.${r.status}` as StringKey)}</Badge>
    ),
  },
  {
    key: 'open',
    header: '',
    cell: (r) => (
      <Link className="underline" href={`/imports/${r.id}`}>
        {t('s08Crm.transfer.open')}
      </Link>
    ),
  },
];

export default async function ImportsPage(): Promise<JSX.Element> {
  const actor = await requirePagePermission('import.manage', 'tenant', 'import_job');
  const perms = getService('permissions');
  const [clients, products, suppliers] = await Promise.all([
    perms.can(actor, 'client.create', { type: 'client' }),
    perms.can(actor, 'product.create', { type: 'product' }),
    perms.can(actor, 'supplier.write', { type: 'supplier' }),
  ]);
  const allowed = [
    ...(clients ? (['clients'] as const) : []),
    ...(products ? (['products'] as const) : []),
    ...(suppliers ? (['suppliers'] as const) : []),
  ];
  let rows: ImportView[] | null;
  try {
    rows = await listImports(actor.companyId as string);
  } catch {
    rows = null;
  }
  return (
    <div className="space-y-sp-16">
      <PageHeader
        title={t('s08Crm.transfer.title')}
        description={t('s08Crm.transfer.description')}
      />
      <ImportUpload allowed={allowed} />
      {rows === null ? (
        <ErrorState description={t('s08Crm.transfer.loadError')} />
      ) : (
        <DataTable
          columns={columns}
          rows={rows}
          getRowId={(r) => r.id}
          caption={t('s08Crm.transfer.title')}
          empty={<EmptyState title={t('s08Crm.transfer.empty')} />}
        />
      )}
    </div>
  );
}
