// path: app/(dashboard)/invoices/batches/page.tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import { DataTable, type DataColumn } from '@/components/shared/data-table';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState, ErrorState } from '@/components/shared/state-views';
import { Badge } from '@/components/ui/badge';
import { t, type StringKey } from '@/lib/i18n';
import { requirePagePermission } from '@/services/base/page-guard';
import { listBatches, type BatchView } from '@/services/invoice/batch';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Batches' };

const columns: readonly DataColumn<BatchView>[] = [
  {
    key: 'action',
    header: t('s09Batches.columns.action'),
    primary: true,
    cell: (r) => t(`s09Batches.actions.${r.action}` as StringKey),
  },
  {
    key: 'progress',
    header: t('s09Batches.columns.progress'),
    cell: (r) =>
      t('s09Batches.progress', {
        done: String(r.done),
        failed: String(r.failed),
        skipped: String(r.skipped),
        total: String(r.total),
      }),
  },
  {
    key: 'status',
    header: t('s09Batches.columns.status'),
    cell: (r) => (
      <Badge variant="outline">{t(`s09Batches.statuses.${r.status}` as StringKey)}</Badge>
    ),
  },
  {
    key: 'started',
    header: t('s09Batches.columns.started'),
    hideOnMobile: true,
    cell: (r) => r.createdAt.slice(0, 16).replace('T', ' '),
  },
  {
    key: 'open',
    header: '',
    cell: (r) => (
      <Link className="underline" href={`/invoices/batches/${r.id}`}>
        {t('s09Batches.detail.open')}
      </Link>
    ),
  },
];

export default async function BatchesPage(): Promise<JSX.Element> {
  const actor = await requirePagePermission('invoice.read', 'tenant', 'invoice_batch');
  let rows: BatchView[] | null;
  try {
    rows = await listBatches(actor.companyId as string);
  } catch {
    rows = null;
  }
  return (
    <div className="space-y-sp-16">
      <PageHeader
        title={t('s09Batches.title')}
        description={t('s09Batches.description')}
        actions={
          <Link className="underline" href="/invoices">
            {t('s09Batches.back')}
          </Link>
        }
      />
      {rows === null ? (
        <ErrorState description={t('s09Invoicing.invoices.loadError')} />
      ) : (
        <DataTable
          columns={columns}
          rows={rows}
          getRowId={(r) => r.id}
          caption={t('s09Batches.title')}
          empty={<EmptyState title={t('s09Batches.empty')} />}
        />
      )}
    </div>
  );
}
