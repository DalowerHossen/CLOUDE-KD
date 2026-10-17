// path: app/(dashboard)/invoices/recurring/page.tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import { DataTable, type DataColumn } from '@/components/shared/data-table';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState, ErrorState } from '@/components/shared/state-views';
import { Badge } from '@/components/ui/badge';
import { t, type StringKey } from '@/lib/i18n';
import { requirePagePermission } from '@/services/base/page-guard';
import { listSchedules, type ScheduleView } from '@/services/invoice/recurring';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Recurring invoices' };

const columns: readonly DataColumn<ScheduleView>[] = [
  { key: 'name', header: t('s09Recurring.columns.name'), primary: true, cell: (r) => r.name },
  { key: 'client', header: t('s09Recurring.columns.client'), cell: (r) => r.clientName },
  {
    key: 'rule',
    header: t('s09Recurring.columns.rule'),
    hideOnMobile: true,
    cell: (r) =>
      t('s09Recurring.rule', {
        every: String(r.every),
        unit: t(`s09Recurring.units.${r.unit}` as StringKey),
      }),
  },
  { key: 'next', header: t('s09Recurring.columns.next'), cell: (r) => r.nextRunDate ?? '-' },
  {
    key: 'runs',
    header: t('s09Recurring.columns.runs'),
    hideOnMobile: true,
    cell: (r) => String(r.occurrencesDone),
  },
  {
    key: 'status',
    header: t('s09Recurring.columns.status'),
    cell: (r) => (
      <Badge variant="outline">{t(`s09Recurring.statuses.${r.status}` as StringKey)}</Badge>
    ),
  },
  {
    key: 'open',
    header: '',
    cell: (r) => (
      <Link className="underline" href={`/invoices/recurring/${r.id}`}>
        {t('s09Invoicing.invoices.open')}
      </Link>
    ),
  },
];

export default async function RecurringPage(): Promise<JSX.Element> {
  const actor = await requirePagePermission('recurring.read', 'tenant', 'recurring_schedule');
  let rows: ScheduleView[] | null;
  try {
    rows = await listSchedules(actor.companyId as string);
  } catch {
    rows = null;
  }
  return (
    <div className="space-y-sp-16">
      <PageHeader
        title={t('s09Recurring.title')}
        description={t('s09Recurring.description')}
        actions={
          <Link className="underline" href="/invoices">
            {t('s09Invoicing.invoices.back')}
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
          caption={t('s09Recurring.title')}
          empty={<EmptyState title={t('s09Recurring.empty')} />}
        />
      )}
    </div>
  );
}
