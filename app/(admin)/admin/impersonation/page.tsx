// path: app/(admin)/admin/impersonation/page.tsx
import type { Metadata } from 'next';
import { DataTable, type DataColumn } from '@/components/shared/data-table';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState, ErrorState } from '@/components/shared/state-views';
import { t } from '@/lib/i18n';
import { requirePagePermission } from '@/services/base/page-guard';
import { listImpersonations, type ImpersonationItem } from '@/services/auth/impersonation-flow';
import { StepUpForm } from '../account-locks/_components/step-up-form';
import { StartImpersonationForm } from './_components/start-form';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Impersonation' };

const columns: readonly DataColumn<ImpersonationItem>[] = [
  {
    key: 'target',
    header: t('s03Auth.impersonation.colTarget'),
    primary: true,
    cell: (r) => <span className="break-all font-mono text-xs">{r.targetUserId}</span>,
  },
  {
    key: 'admin',
    header: t('s03Auth.impersonation.colAdmin'),
    hideOnMobile: true,
    cell: (r) => <span className="break-all font-mono text-xs">{r.adminUserId}</span>,
  },
  {
    key: 'start',
    header: t('s03Auth.impersonation.colStart'),
    cell: (r) => <time dateTime={r.startedAt}>{r.startedAt.replace('T', ' ').slice(0, 16)}</time>,
  },
  {
    key: 'end',
    header: t('s03Auth.impersonation.colEnd'),
    cell: (r) => (r.endedAt ?? r.expiresAt).replace('T', ' ').slice(0, 16),
  },
];

export default async function ImpersonationPage(): Promise<JSX.Element> {
  await requirePagePermission('auth.impersonate', 'platform', 'impersonation_session');
  let rows: ImpersonationItem[] | null;
  try {
    rows = await listImpersonations();
  } catch {
    rows = null;
  }
  return (
    <div className="space-y-sp-24">
      <PageHeader
        title={t('s03Auth.impersonation.title')}
        description={t('s03Auth.impersonation.description')}
      />
      <StepUpForm />
      <StartImpersonationForm />
      {rows === null ? (
        <ErrorState description={t('s03Auth.locks.loadError')} />
      ) : (
        <DataTable
          columns={columns}
          rows={rows}
          getRowId={(r) => r.id}
          caption={t('s03Auth.impersonation.caption')}
          empty={
            <EmptyState
              title={t('s03Auth.impersonation.emptyTitle')}
              description={t('s03Auth.impersonation.emptyBody')}
            />
          }
        />
      )}
    </div>
  );
}
