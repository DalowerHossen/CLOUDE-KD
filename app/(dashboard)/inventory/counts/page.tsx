// path: app/(dashboard)/inventory/counts/page.tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import { CountStart } from '@/components/inventory/count-start';
import { DataTable, type DataColumn } from '@/components/shared/data-table';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState, ErrorState } from '@/components/shared/state-views';
import { Badge } from '@/components/ui/badge';
import { getService } from '@/lib/container';
import { t, type StringKey } from '@/lib/i18n';
import { requirePagePermission } from '@/services/base/page-guard';
import { listCounts, type CountView } from '@/services/inventory/counts';
import { ensureDefaultWarehouse, listWarehouses } from '@/services/inventory/warehouses';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Stock counts' };

type Row = Omit<CountView, 'lines'>;
const columns: readonly DataColumn<Row>[] = [
  { key: 'number', header: t('s08Crm.counts.number'), primary: true, cell: (r) => r.number },
  { key: 'wh', header: t('s08Crm.counts.warehouse'), cell: (r) => r.warehouseName },
  {
    key: 'status',
    header: t('s08Crm.counts.status'),
    cell: (r) => (
      <Badge variant="outline">{t(`s08Crm.counts.statuses.${r.status}` as StringKey)}</Badge>
    ),
  },
  {
    key: 'started',
    header: t('s08Crm.counts.started'),
    hideOnMobile: true,
    cell: (r) => r.startedAt.slice(0, 10),
  },
  {
    key: 'open',
    header: '',
    cell: (r) => (
      <Link className="underline" href={`/inventory/counts/${r.id}`}>
        {t('s08Crm.counts.open')}
      </Link>
    ),
  },
];

export default async function CountsPage(): Promise<JSX.Element> {
  const actor = await requirePagePermission('inventory.read', 'tenant', 'stock_count');
  const companyId = actor.companyId as string;
  let rows: Row[] | null;
  try {
    rows = await listCounts(companyId);
  } catch {
    rows = null;
  }
  await ensureDefaultWarehouse(companyId).catch(() => undefined);
  const warehouses = await listWarehouses(companyId).catch(() => []);
  const canCount = await getService('permissions').can(actor, 'inventory.count', {
    type: 'stock_count',
  });
  return (
    <div className="space-y-sp-16">
      <PageHeader
        title={t('s08Crm.counts.title')}
        description={t('s08Crm.counts.description')}
        actions={
          <Link className="underline" href="/inventory">
            {t('s08Crm.inventory.title')}
          </Link>
        }
      />
      {canCount ? <CountStart warehouses={warehouses} /> : null}
      {rows === null ? (
        <ErrorState description={t('s08Crm.inventory.loadError')} />
      ) : (
        <DataTable
          columns={columns}
          rows={rows}
          getRowId={(r) => r.id}
          caption={t('s08Crm.counts.title')}
          empty={<EmptyState title={t('s08Crm.counts.empty')} />}
        />
      )}
    </div>
  );
}
