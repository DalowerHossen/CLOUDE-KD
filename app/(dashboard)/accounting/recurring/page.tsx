// path: app/(dashboard)/accounting/recurring/page.tsx
import type { Metadata } from 'next';
import { ActionButton } from '@/app/(dashboard)/wallet/_components/action-button';
import { RecurringForm } from '@/components/accounting/recurring-form';
import { DataTable, type DataColumn } from '@/components/shared/data-table';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState, ErrorState } from '@/components/shared/state-views';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getService } from '@/lib/container';
import { t, type StringKey } from '@/lib/i18n';
import { requirePagePermission } from '@/services/base/page-guard';
import { listAccounts } from '@/services/accounting/accounts';
import { listRecurring, type RecurringView } from '@/services/accounting/recurring';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Recurring entries' };

export default async function RecurringPage(): Promise<JSX.Element> {
  const actor = await requirePagePermission('accounting.read', 'tenant', 'recurring_journal');
  const companyId = actor.companyId as string;
  const canManage = await getService('permissions').can(actor, 'accounting.period.manage', {
    type: 'recurring_journal',
  });
  let data: { rows: RecurringView[]; accounts: { id: string; label: string }[] } | null;
  try {
    const [rows, accounts] = await Promise.all([
      listRecurring(companyId),
      listAccounts(companyId, { status: 'active' }),
    ]);
    data = {
      rows,
      accounts: accounts
        .filter((a) => a.allowPosting)
        .map((a) => ({ id: a.id, label: `${a.code} ${a.name}` })),
    };
  } catch {
    data = null;
  }
  const columns: readonly DataColumn<RecurringView>[] = [
    {
      key: 'name',
      header: t('s15Accounting.recurring.columns.name'),
      primary: true,
      cell: (r) => (
        <span>
          {r.name}
          {r.lastError ? (
            <Alert variant="destructive">
              {t('s15Accounting.recurring.lastError')}: {r.lastError}
            </Alert>
          ) : null}
        </span>
      ),
    },
    {
      key: 'freq',
      header: t('s15Accounting.recurring.columns.frequency'),
      hideOnMobile: true,
      cell: (r) => t(`s15Accounting.recurring.frequencies.${r.frequency}` as StringKey),
    },
    { key: 'next', header: t('s15Accounting.recurring.columns.next'), cell: (r) => r.nextRun },
    {
      key: 'runs',
      header: t('s15Accounting.recurring.columns.runs'),
      hideOnMobile: true,
      cell: (r) => String(r.runCount),
    },
    {
      key: 'status',
      header: t('s15Accounting.recurring.columns.status'),
      cell: (r) => (
        <span className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">
            {t(`s15Accounting.recurring.statuses.${r.status}` as StringKey)}
          </Badge>
          {canManage && r.status !== 'finished' ? (
            <ActionButton
              endpoint={`/api/accounting/recurring/${r.id}`}
              method="PATCH"
              body={{ status: r.status === 'active' ? 'paused' : 'active' }}
              label={
                r.status === 'active'
                  ? t('s15Accounting.recurring.pause')
                  : t('s15Accounting.recurring.resume')
              }
              doneText={t('s15Accounting.accounts.done')}
            />
          ) : null}
          {canManage ? (
            <ActionButton
              endpoint={`/api/accounting/recurring/${r.id}`}
              method="DELETE"
              label={t('s15Accounting.recurring.remove')}
              doneText={t('s15Accounting.accounts.done')}
            />
          ) : null}
        </span>
      ),
    },
  ];
  return (
    <div className="space-y-sp-24">
      <PageHeader
        title={t('s15Accounting.recurring.title')}
        description={t('s15Accounting.recurring.description')}
      />
      {data === null ? (
        <ErrorState description={t('s15Accounting.common.loadError')} />
      ) : (
        <>
          <DataTable
            columns={columns}
            rows={data.rows}
            getRowId={(r) => r.id}
            caption={t('s15Accounting.recurring.title')}
            empty={<EmptyState title={t('s15Accounting.recurring.empty')} />}
          />
          {canManage ? (
            <Card>
              <CardHeader>
                <CardTitle>{t('s15Accounting.recurring.new')}</CardTitle>
              </CardHeader>
              <CardContent>
                <RecurringForm accounts={data.accounts} />
              </CardContent>
            </Card>
          ) : null}
        </>
      )}
    </div>
  );
}
