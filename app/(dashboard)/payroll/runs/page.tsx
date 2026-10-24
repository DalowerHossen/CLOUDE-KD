// path: app/(dashboard)/payroll/runs/page.tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import { JsonForm } from '@/app/(dashboard)/wallet/_components/json-form';
import { DataTable, type DataColumn } from '@/components/shared/data-table';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState, ErrorState } from '@/components/shared/state-views';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getService } from '@/lib/container';
import { t, type StringKey } from '@/lib/i18n';
import { requirePagePermission } from '@/services/base/page-guard';
import { listRuns, type RunView } from '@/services/payroll/runs';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Pay runs' };

export default async function RunsPage(): Promise<JSX.Element> {
  const actor = await requirePagePermission('payroll.run.read', 'tenant', 'pay_run');
  const canManage = await getService('permissions').can(actor, 'payroll.run.manage', {
    type: 'pay_run',
  });
  let rows: RunView[] | null;
  try {
    rows = await listRuns(actor.companyId as string);
  } catch {
    rows = null;
  }
  const today = new Date().toISOString().slice(0, 10);
  const hint = t('s15Payroll.runs.detail.dateHint');
  const columns: readonly DataColumn<RunView>[] = [
    {
      key: 'number',
      header: t('s15Payroll.runs.columns.number'),
      primary: true,
      cell: (r) => (
        <Link href={`/payroll/runs/${r.id}`} prefetch={false} className="font-medium underline">
          {r.number}
        </Link>
      ),
    },
    {
      key: 'period',
      header: t('s15Payroll.runs.columns.period'),
      cell: (r) => `${r.periodStart} - ${r.periodEnd}`,
    },
    {
      key: 'emp',
      header: t('s15Payroll.runs.columns.employees'),
      hideOnMobile: true,
      cell: (r) => String(r.employeeCount),
    },
    {
      key: 'net',
      header: t('s15Payroll.runs.columns.net'),
      cell: (r) => <span className="block text-right tabular-nums">{r.net}</span>,
    },
    {
      key: 'status',
      header: t('s15Payroll.runs.columns.status'),
      cell: (r) => (
        <Badge variant="outline">{t(`s15Payroll.runs.statuses.${r.status}` as StringKey)}</Badge>
      ),
    },
  ];
  return (
    <div className="space-y-sp-24">
      <PageHeader
        title={t('s15Payroll.runs.title')}
        description={t('s15Payroll.runs.description')}
      />
      {rows === null ? (
        <ErrorState description={t('s15Payroll.runs.loadError')} />
      ) : (
        <>
          <DataTable
            columns={columns}
            rows={rows}
            getRowId={(r) => r.id}
            caption={t('s15Payroll.runs.title')}
            empty={<EmptyState title={t('s15Payroll.runs.empty')} />}
          />
          {canManage ? (
            <Card>
              <CardHeader>
                <CardTitle>{t('s15Payroll.runs.newTitle')}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-sp-12">
                <p className="text-sm text-muted-foreground">{t('s15Payroll.runs.newHelp')}</p>
                <JsonForm
                  endpoint="/api/payroll/runs"
                  idempotent
                  submitLabel={t('s15Payroll.runs.newTitle')}
                  doneText={t('s15Payroll.runs.done')}
                  fields={[
                    {
                      name: 'periodStart',
                      label: t('s15Payroll.runs.periodStart'),
                      hint,
                      initial: `${today.slice(0, 7)}-01`,
                      required: true,
                    },
                    {
                      name: 'periodEnd',
                      label: t('s15Payroll.runs.periodEnd'),
                      hint,
                      required: true,
                    },
                    { name: 'payDate', label: t('s15Payroll.runs.payDate'), hint, required: true },
                  ]}
                />
              </CardContent>
            </Card>
          ) : null}
        </>
      )}
    </div>
  );
}
