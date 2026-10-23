// path: app/(admin)/admin/payouts/page.tsx
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { DataTable, type DataColumn } from '@/components/shared/data-table';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState, ErrorState } from '@/components/shared/state-views';
import { Badge } from '@/components/ui/badge';
import { getService } from '@/lib/container';
import { t, type StringKey } from '@/lib/i18n';
import { companyNames } from '@/services/dispute/disputes';
import { listQueue, type PayoutView } from '@/services/payout/payouts';
import { PLATFORM_ROLES } from '@/types/contracts';
import { QueueActions } from './_components/queue-actions';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Payout queue' };

type Row = PayoutView & { companyId: string; companyName: string };

const columns: readonly DataColumn<Row>[] = [
  {
    key: 'company',
    header: t('s14Wallet.admin.columns.company'),
    primary: true,
    cell: (r) => r.companyName,
  },
  { key: 'amount', header: t('s14Wallet.admin.columns.amount'), cell: (r) => `USD ${r.amount}` },
  {
    key: 'net',
    header: t('s14Wallet.admin.columns.net'),
    cell: (r) => (r.localAmount ? `${r.localAmount} ${r.currency}` : `USD ${r.net}`),
  },
  {
    key: 'status',
    header: t('s14Wallet.admin.columns.status'),
    cell: (r) => (
      <Badge variant="outline">{t(`s14Wallet.payouts.statuses.${r.status}` as StringKey)}</Badge>
    ),
  },
  {
    key: 'attempts',
    header: t('s14Wallet.admin.columns.attempts'),
    hideOnMobile: true,
    cell: (r) => String(r.attempts),
  },
  {
    key: 'date',
    header: t('s14Wallet.admin.columns.date'),
    hideOnMobile: true,
    cell: (r) => r.createdAt.slice(0, 10),
  },
  { key: 'actions', header: '', cell: (r) => <QueueActions id={r.id} status={r.status} /> },
];

export default async function PayoutQueuePage(): Promise<JSX.Element> {
  const actor = await getService('auth').getActor();
  if (
    !actor ||
    !PLATFORM_ROLES.includes(actor.role) ||
    !(await getService('permissions').can(actor, 'payout.queue.manage', { type: 'payout' }))
  )
    notFound();
  let rows: Row[] | null;
  try {
    const list = await listQueue(actor, ['processing', 'approved', 'pending_approval', 'paid']);
    const names = await companyNames(list.map((p) => p.companyId));
    rows = list.map((p) => ({ ...p, companyName: names.get(p.companyId) ?? p.companyId }));
  } catch {
    rows = null;
  }
  return (
    <div className="space-y-sp-16">
      <PageHeader
        title={t('s14Wallet.admin.queueTitle')}
        description={t('s14Wallet.admin.queueDescription')}
      />
      {rows === null ? (
        <ErrorState description={t('s14Wallet.common.loadError')} />
      ) : (
        <DataTable
          columns={columns}
          rows={rows}
          getRowId={(r) => r.id}
          caption={t('s14Wallet.admin.queueTitle')}
          empty={<EmptyState title={t('s14Wallet.admin.queueEmpty')} />}
        />
      )}
    </div>
  );
}
