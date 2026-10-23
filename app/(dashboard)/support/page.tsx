// path: app/(dashboard)/support/page.tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import { DataTable, type DataColumn } from '@/components/shared/data-table';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState, ErrorState } from '@/components/shared/state-views';
import { Badge } from '@/components/ui/badge';
import { t, type StringKey } from '@/lib/i18n';
import { requirePagePermission } from '@/services/base/page-guard';
import { listOwn, type TicketRow } from '@/services/support/tickets';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Support' };

const columns: readonly DataColumn<TicketRow>[] = [
  { key: 'number', header: t('s07Company.support.number'), cell: (r) => r.number },
  {
    key: 'subject',
    header: t('s07Company.support.subject'),
    primary: true,
    cell: (r) => r.subject,
  },
  {
    key: 'status',
    header: t('s07Company.support.status'),
    cell: (r) => (
      <Badge variant="outline">{t(`s07Company.support.statuses.${r.status}` as StringKey)}</Badge>
    ),
  },
  {
    key: 'updated',
    header: t('s07Company.support.updated'),
    hideOnMobile: true,
    cell: (r) => r.lastActivityAt.replace('T', ' ').slice(0, 16),
  },
  {
    key: 'open',
    header: '',
    cell: (r) => (
      <Link className="underline" href={`/support/${r.id}`}>
        {t('s07Company.support.open')}
      </Link>
    ),
  },
];

export default async function SupportPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}): Promise<JSX.Element> {
  const actor = await requirePagePermission('support.read', 'tenant', 'support_ticket');
  const view = (await searchParams).view === 'closed' ? 'closed' : 'open';
  let rows: TicketRow[] | null;
  try {
    rows = await listOwn(actor, view);
  } catch {
    rows = null;
  }
  return (
    <div className="space-y-sp-16">
      <PageHeader
        title={t('s07Company.support.title')}
        description={t('s07Company.support.description')}
        actions={
          <Link className="underline" href="/support/new">
            {t('s07Company.support.newTicket')}
          </Link>
        }
      />
      <nav className="flex gap-sp-12 text-sm" aria-label={t('s07Company.support.title')}>
        <Link className={view === 'open' ? 'font-semibold underline' : 'underline'} href="/support">
          {t('s07Company.support.filterOpen')}
        </Link>
        <Link
          className={view === 'closed' ? 'font-semibold underline' : 'underline'}
          href="/support?view=closed"
        >
          {t('s07Company.support.filterClosed')}
        </Link>
      </nav>
      {rows === null ? (
        <ErrorState description={t('s07Company.support.loadError')} />
      ) : (
        <DataTable
          columns={columns}
          rows={rows}
          getRowId={(r) => r.id}
          caption={t('s07Company.support.title')}
          empty={<EmptyState title={t('s07Company.support.empty')} />}
        />
      )}
    </div>
  );
}
