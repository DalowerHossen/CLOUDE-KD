// path: app/(dashboard)/credit-notes/page.tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import { DataTable, type DataColumn } from '@/components/shared/data-table';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState, ErrorState } from '@/components/shared/state-views';
import { Badge } from '@/components/ui/badge';
import { t, type StringKey } from '@/lib/i18n';
import { Money } from '@/lib/utils/currency';
import { formatMoney } from '@/lib/utils/formatting';
import { requirePagePermission } from '@/services/base/page-guard';
import { listCreditNotes, type CreditNoteView } from '@/services/credit/credit-notes';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Credit notes' };

const money = (v: string): string => formatMoney(Money.parse(v));

const columns: readonly DataColumn<CreditNoteView>[] = [
  {
    key: 'number',
    header: t('s09Credits.columns.number'),
    primary: true,
    cell: (r) => r.number ?? t('s09Invoicing.invoices.draftNumber'),
  },
  {
    key: 'client',
    header: t('s09Credits.columns.client'),
    cell: (r) => r.billTo.name || r.walkInName,
  },
  {
    key: 'reason',
    header: t('s09Credits.columns.reason'),
    hideOnMobile: true,
    cell: (r) => t(`s09Credits.reasons.${r.reason}` as StringKey),
  },
  { key: 'total', header: t('s09Credits.columns.total'), cell: (r) => money(r.total) },
  {
    key: 'left',
    header: t('s09Credits.columns.left'),
    hideOnMobile: true,
    cell: (r) => money(r.balance),
  },
  {
    key: 'status',
    header: t('s09Credits.columns.status'),
    cell: (r) => (
      <Badge variant="outline">{t(`s09Credits.statuses.${r.status}` as StringKey)}</Badge>
    ),
  },
  {
    key: 'open',
    header: '',
    cell: (r) => (
      <Link className="underline" href={`/credit-notes/${r.id}`}>
        {t('s09Invoicing.invoices.open')}
      </Link>
    ),
  },
];

export default async function CreditNotesPage(): Promise<JSX.Element> {
  const actor = await requirePagePermission('credit.read', 'tenant', 'credit_note');
  let rows: CreditNoteView[] | null;
  try {
    rows = await listCreditNotes(actor.companyId as string, { limit: 100 });
  } catch {
    rows = null;
  }
  return (
    <div className="space-y-sp-16">
      <PageHeader title={t('s09Credits.title')} description={t('s09Credits.description')} />
      {rows === null ? (
        <ErrorState description={t('s09Invoicing.invoices.loadError')} />
      ) : (
        <DataTable
          columns={columns}
          rows={rows}
          getRowId={(r) => r.id}
          caption={t('s09Credits.title')}
          empty={<EmptyState title={t('s09Credits.empty')} />}
        />
      )}
    </div>
  );
}
