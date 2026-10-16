// path: app/(admin)/admin/account-locks/page.tsx
import type { Metadata } from 'next';
import { DataTable, type DataColumn } from '@/components/shared/data-table';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState, ErrorState } from '@/components/shared/state-views';
import { Badge } from '@/components/ui/badge';
import { t } from '@/lib/i18n';
import { requirePagePermission } from '@/services/base/page-guard';
import { listLockedAccounts, type LockedAccount } from '@/services/auth/unlock-flow';
import { LockActions } from './_components/lock-actions';
import { StepUpForm } from './_components/step-up-form';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Account locks' };

function statusText(row: LockedAccount): string {
  if (!row.pendingRequest) return t('s03Auth.locks.statusNone');
  return row.pendingRequest.status === 'confirmed'
    ? t('s03Auth.locks.statusConfirmed')
    : t('s03Auth.locks.statusPending');
}

const columns: readonly DataColumn<LockedAccount>[] = [
  {
    key: 'account',
    header: t('s03Auth.locks.colAccount'),
    primary: true,
    cell: (r) => <span className="break-all">{r.email || r.userId}</span>,
  },
  {
    key: 'until',
    header: t('s03Auth.locks.colUntil'),
    cell: (r) => (
      <time dateTime={r.lockedUntil}>{r.lockedUntil.replace('T', ' ').slice(0, 16)}</time>
    ),
  },
  { key: 'reason', header: t('s03Auth.locks.colReason'), cell: (r) => r.reason ?? '-' },
  {
    key: 'times',
    header: t('s03Auth.locks.colTimes'),
    hideOnMobile: true,
    cell: (r) => r.lockCount,
  },
  {
    key: 'status',
    header: t('s03Auth.locks.colStatus'),
    cell: (r) => <Badge variant="outline">{statusText(r)}</Badge>,
  },
  {
    key: 'actions',
    header: t('s03Auth.locks.colActions'),
    cell: (r) => <LockActions userId={r.userId} pending={r.pendingRequest} />,
  },
];

export default async function AccountLocksPage(): Promise<JSX.Element> {
  await requirePagePermission('auth.account.read', 'platform', 'account_lock');
  let rows: LockedAccount[] | null;
  try {
    rows = await listLockedAccounts();
  } catch {
    rows = null;
  }
  return (
    <div className="space-y-sp-24">
      <PageHeader title={t('s03Auth.locks.title')} description={t('s03Auth.locks.description')} />
      <StepUpForm />
      {rows === null ? (
        <ErrorState description={t('s03Auth.locks.loadError')} />
      ) : (
        <DataTable
          columns={columns}
          rows={rows}
          getRowId={(r) => r.userId}
          caption={t('s03Auth.locks.caption')}
          empty={
            <EmptyState
              title={t('s03Auth.locks.emptyTitle')}
              description={t('s03Auth.locks.emptyBody')}
            />
          }
        />
      )}
    </div>
  );
}
