// path: app/(dashboard)/projects/unbilled/page.tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import { DataTable, type DataColumn } from '@/components/shared/data-table';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState, ErrorState } from '@/components/shared/state-views';
import { t } from '@/lib/i18n';
import { Money } from '@/lib/utils/currency';
import { formatMoney } from '@/lib/utils/formatting';
import { requirePagePermission } from '@/services/base/page-guard';
import { unbilledSummary, type UnbilledSummary } from '@/services/project/billing';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Time waiting to be billed' };

const columns: readonly DataColumn<UnbilledSummary>[] = [
  {
    key: 'project',
    header: t('s09Projects.bill.unbilledColumns.project'),
    primary: true,
    cell: (r) => r.projectName,
  },
  {
    key: 'client',
    header: t('s09Projects.bill.unbilledColumns.client'),
    cell: (r) => r.clientName,
  },
  { key: 'hours', header: t('s09Projects.bill.unbilledColumns.hours'), cell: (r) => r.hours },
  {
    key: 'amount',
    header: t('s09Projects.bill.unbilledColumns.amount'),
    cell: (r) => formatMoney(Money.parse(r.amount)),
  },
  {
    key: 'open',
    header: '',
    cell: (r) => (
      <Link className="underline" href={`/projects/${r.projectId}/bill`}>
        {t('s09Projects.bill.link')}
      </Link>
    ),
  },
];

export default async function UnbilledPage(): Promise<JSX.Element> {
  const actor = await requirePagePermission('project.bill', 'tenant', 'project');
  let rows: UnbilledSummary[] | null;
  try {
    rows = await unbilledSummary(actor);
  } catch {
    rows = null;
  }
  return (
    <div className="space-y-sp-16">
      <PageHeader
        title={t('s09Projects.bill.unbilledTitle')}
        description={t('s09Projects.bill.unbilledDescription')}
        actions={
          <Link className="underline" href="/projects">
            {t('s09Projects.back')}
          </Link>
        }
      />
      {rows === null ? (
        <ErrorState description={t('s09Invoicing.invoices.loadError')} />
      ) : (
        <DataTable
          columns={columns}
          rows={rows}
          getRowId={(r) => r.projectId}
          caption={t('s09Projects.bill.unbilledTitle')}
          empty={<EmptyState title={t('s09Projects.bill.unbilledEmpty')} />}
        />
      )}
    </div>
  );
}
