// path: app/(dashboard)/payroll/declarations/page.tsx
import type { Metadata } from 'next';
import { ActionButton } from '@/app/(dashboard)/wallet/_components/action-button';
import { DataTable, type DataColumn } from '@/components/shared/data-table';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState, ErrorState } from '@/components/shared/state-views';
import { Badge } from '@/components/ui/badge';
import { t, type StringKey } from '@/lib/i18n';
import { requirePagePermission } from '@/services/base/page-guard';
import { listDeclarations, type DeclarationView } from '@/services/payroll/portal';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Tax declarations' };

export default async function DeclarationsPage(): Promise<JSX.Element> {
  const actor = await requirePagePermission('payroll.portal.manage', 'tenant', 'employee');
  let rows: DeclarationView[] | null;
  try {
    rows = await listDeclarations(actor.companyId as string);
  } catch {
    rows = null;
  }
  const done = t('s15Payroll.declarations.decided');
  const columns: readonly DataColumn<DeclarationView>[] = [
    {
      key: 'employee',
      header: t('s15Payroll.declarations.columns.employee'),
      primary: true,
      cell: (r) => r.employeeName,
    },
    {
      key: 'filing',
      header: t('s15Payroll.declarations.columns.filing'),
      cell: (r) => r.filingStatus,
    },
    {
      key: 'allow',
      header: t('s15Payroll.declarations.columns.allowances'),
      hideOnMobile: true,
      cell: (r) => String(r.allowances),
    },
    {
      key: 'sent',
      header: t('s15Payroll.declarations.columns.sent'),
      hideOnMobile: true,
      cell: (r) => r.createdAt.slice(0, 10),
    },
    {
      key: 'status',
      header: t('s15Payroll.declarations.columns.status'),
      cell: (r) => (
        <span className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">
            {t(`s15Payroll.declarations.statuses.${r.status}` as StringKey)}
          </Badge>
          {r.status === 'pending' ? (
            <>
              <ActionButton
                endpoint={`/api/payroll/declarations/${r.id}/decide`}
                body={{ decision: 'approve' }}
                variant="default"
                label={t('s15Payroll.declarations.approve')}
                doneText={done}
              />
              <ActionButton
                endpoint={`/api/payroll/declarations/${r.id}/decide`}
                body={{ decision: 'reject', reason: t('s15Payroll.declarations.rejectReason') }}
                label={t('s15Payroll.declarations.reject')}
                doneText={done}
              />
            </>
          ) : null}
        </span>
      ),
    },
  ];
  return (
    <div className="space-y-sp-24">
      <PageHeader
        title={t('s15Payroll.declarations.title')}
        description={t('s15Payroll.declarations.description')}
      />
      {rows === null ? (
        <ErrorState description={t('s15Payroll.declarations.loadError')} />
      ) : (
        <DataTable
          columns={columns}
          rows={rows}
          getRowId={(r) => r.id}
          caption={t('s15Payroll.declarations.title')}
          empty={<EmptyState title={t('s15Payroll.declarations.empty')} />}
        />
      )}
    </div>
  );
}
