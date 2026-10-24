// path: app/(dashboard)/payroll/runs/[id]/page.tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { ActionButton } from '@/app/(dashboard)/wallet/_components/action-button';
import { JsonForm } from '@/app/(dashboard)/wallet/_components/json-form';
import { DataTable, type DataColumn } from '@/components/shared/data-table';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState, ErrorState } from '@/components/shared/state-views';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getService } from '@/lib/container';
import { NotFoundError } from '@/lib/errors';
import { t, type StringKey } from '@/lib/i18n';
import { requirePagePermission } from '@/services/base/page-guard';
import { getRun, type ItemView, type RunView } from '@/services/payroll/runs';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Pay run' };

export default async function RunPage({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<JSX.Element> {
  const actor = await requirePagePermission('payroll.run.read', 'tenant', 'pay_run');
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) notFound();
  const permissions = getService('permissions');
  const canManage = await permissions.can(actor, 'payroll.run.manage', { type: 'pay_run' });
  const canApprove = await permissions.can(actor, 'payroll.run.approve', { type: 'pay_run' });
  const canPay = await permissions.can(actor, 'payroll.run.pay', { type: 'pay_run' });
  let data: { run: RunView; items: ItemView[] } | null;
  try {
    data = await getRun(actor.companyId as string, id);
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    data = null;
  }
  const run = data?.run;
  const d = (k: string): string => t(`s15Payroll.runs.detail.${k}` as StringKey);
  const money = (v: string): JSX.Element => (
    <span className="block text-right tabular-nums">{v}</span>
  );
  const columns: readonly DataColumn<ItemView>[] = [
    {
      key: 'employee',
      header: d('itemColumns.employee'),
      primary: true,
      cell: (r) => (
        <span>
          {r.number} {r.name}
          {r.warnings.map((w) => (
            <span key={w} className="block text-xs text-muted-foreground">
              {w}
            </span>
          ))}
        </span>
      ),
    },
    {
      key: 'gross',
      header: d('itemColumns.gross'),
      hideOnMobile: true,
      cell: (r) => money(r.gross),
    },
    {
      key: 'taxes',
      header: d('itemColumns.taxes'),
      hideOnMobile: true,
      cell: (r) => money(r.employeeTaxes),
    },
    { key: 'net', header: d('itemColumns.net'), cell: (r) => money(r.net) },
    {
      key: 'payslip',
      header: d('itemColumns.payslip'),
      cell: (r) =>
        r.payslip ? (
          <Link
            href={`/api/payroll/runs/items/${r.id}/payslip`}
            prefetch={false}
            className="underline"
          >
            {d('payslipOpen')}
          </Link>
        ) : (
          <span className="text-muted-foreground">{d('payslipNone')}</span>
        ),
    },
  ];
  const editable = run?.status === 'draft' || run?.status === 'calculated';
  const done = t('s15Payroll.runs.done');
  return (
    <div className="space-y-sp-24">
      <PageHeader
        title={run ? `${run.number}` : t('s15Payroll.runs.title')}
        description={
          run
            ? `${run.periodStart} - ${run.periodEnd}, ${t(`s15Payroll.runs.statuses.${run.status}` as StringKey)}`
            : undefined
        }
        actions={
          <Button asChild variant="outline">
            <Link href="/payroll/runs" prefetch={false}>
              {d('back')}
            </Link>
          </Button>
        }
      />
      {data === null || !run ? (
        <ErrorState description={t('s15Payroll.runs.loadError')} />
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="flex flex-wrap items-center gap-2">
                {d('totals')}{' '}
                <Badge variant="outline">
                  {t(`s15Payroll.runs.statuses.${run.status}` as StringKey)}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-sp-8 text-sm sm:grid-cols-2 lg:grid-cols-3">
                {(
                  [
                    ['gross', run.gross],
                    ['taxes', run.employeeTaxes],
                    ['deductions', run.deductions],
                    ['net', run.net],
                    ['employerContributions', run.employerContributions],
                    ['employerCost', run.employerCost],
                  ] as const
                ).map(([k, v]) => (
                  <div key={k}>
                    <dt className="text-muted-foreground">{d(k)}</dt>
                    <dd className="font-semibold tabular-nums">{v}</dd>
                  </div>
                ))}
                {run.paidOn ? (
                  <div>
                    <dt className="text-muted-foreground">{d('paidInfo')}</dt>
                    <dd>
                      {run.paidOn} ({run.paymentReference})
                    </dd>
                  </div>
                ) : null}
              </dl>
            </CardContent>
          </Card>
          <div className="flex flex-wrap gap-sp-8">
            {editable && canManage ? (
              <>
                <ActionButton
                  endpoint={`/api/payroll/runs/${id}/calculate`}
                  label={d('recalculate')}
                  doneText={done}
                />
                {run.status === 'calculated' && run.employeeCount > 0 ? (
                  <ActionButton
                    endpoint={`/api/payroll/runs/${id}/submit`}
                    variant="default"
                    label={d('submit')}
                    doneText={d('submitted')}
                  />
                ) : null}
                <ActionButton
                  endpoint={`/api/payroll/runs/${id}`}
                  method="DELETE"
                  variant="destructive"
                  label={d('remove')}
                  doneText={d('removed')}
                />
              </>
            ) : null}
            {run.status === 'submitted' && canApprove ? (
              <>
                <ActionButton
                  endpoint={`/api/payroll/runs/${id}/decide`}
                  body={{ decision: 'approve' }}
                  variant="default"
                  label={d('approve')}
                  doneText={d('decided')}
                />
                <ActionButton
                  endpoint={`/api/payroll/runs/${id}/decide`}
                  body={{ decision: 'reject', reason: 'Sent back to draft' }}
                  label={d('reject')}
                  doneText={d('decided')}
                />
              </>
            ) : null}
            {(run.status === 'approved' || run.status === 'paid') &&
            canManage &&
            data.items.some((i) => !i.payslip) ? (
              <ActionButton
                endpoint={`/api/payroll/runs/${id}/payslips`}
                label={d('makePayslips')}
                doneText={d('payslipsMade')}
              />
            ) : null}
            {run.status === 'approved' && canPay ? (
              <Button asChild variant="outline">
                <a href={`/api/payroll/runs/${id}/payment-file`}>{d('transferFile')}</a>
              </Button>
            ) : null}
          </div>
          {run.errors.length > 0 ? (
            <Alert variant="destructive">
              <p className="font-medium">{d('errorsTitle')}</p>
              <ul className="list-disc pl-5 text-sm">
                {run.errors.map((e) => (
                  <li key={e.employeeId}>
                    {e.name}: {e.message}
                  </li>
                ))}
              </ul>
            </Alert>
          ) : null}
          <Card>
            <CardHeader>
              <CardTitle>{d('itemsTitle')}</CardTitle>
            </CardHeader>
            <CardContent>
              <DataTable
                columns={columns}
                rows={data.items}
                getRowId={(r) => r.id}
                caption={d('itemsTitle')}
                empty={<EmptyState title={d('none')} />}
              />
            </CardContent>
          </Card>
          {editable && canManage ? (
            <Card>
              <CardHeader>
                <CardTitle>{d('inputsTitle')}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-sp-12">
                <p className="text-sm text-muted-foreground">{d('inputsHelp')}</p>
                <JsonForm
                  endpoint={`/api/payroll/runs/${id}/inputs`}
                  method="PUT"
                  submitLabel={d('saveInputs')}
                  doneText={done}
                  fields={[
                    {
                      name: 'employeeId',
                      label: d('employee'),
                      kind: 'select',
                      required: true,
                      options: [
                        ...data.items.map((i) => ({
                          value: i.employeeId,
                          label: `${i.number} ${i.name}`,
                        })),
                        ...run.errors.map((e) => ({ value: e.employeeId, label: e.name })),
                      ],
                    },
                    { name: 'regularHours', label: d('regularHours'), initial: '0' },
                    { name: 'overtimeHours', label: d('overtimeHours'), initial: '0' },
                    { name: 'sales', label: d('sales'), initial: '0' },
                    { name: 'bonus', label: d('bonus'), initial: '0' },
                    { name: 'incentive', label: d('incentive'), initial: '0' },
                  ]}
                />
              </CardContent>
            </Card>
          ) : null}
          {run.status === 'approved' && canPay ? (
            <Card>
              <CardHeader>
                <CardTitle>{d('payTitle')}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-sp-12">
                <p className="text-sm text-muted-foreground">{d('payHelp')}</p>
                <JsonForm
                  endpoint={`/api/payroll/runs/${id}/pay`}
                  idempotent
                  submitLabel={d('payButton')}
                  doneText={d('paid')}
                  fields={[
                    {
                      name: 'paidOn',
                      label: d('paidOn'),
                      hint: d('dateHint'),
                      initial: new Date().toISOString().slice(0, 10),
                      required: true,
                    },
                    { name: 'reference', label: d('reference'), required: true },
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
