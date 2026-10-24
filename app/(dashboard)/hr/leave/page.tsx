// path: app/(dashboard)/hr/leave/page.tsx
import type { Metadata } from 'next';
import { ActionButton } from '@/app/(dashboard)/wallet/_components/action-button';
import { JsonForm } from '@/app/(dashboard)/wallet/_components/json-form';
import { DataTable, type DataColumn } from '@/components/shared/data-table';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState, ErrorState } from '@/components/shared/state-views';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getService } from '@/lib/container';
import { t, type StringKey } from '@/lib/i18n';
import { requirePagePermission } from '@/services/base/page-guard';
import { listEmployees, type EmployeeView } from '@/services/payroll/employees';
import {
  listBalances,
  listLeaveTypes,
  listRequests,
  type BalanceView,
  type LeaveTypeView,
  type RequestView,
} from '@/services/hr/leave';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Leave' };

export default async function LeavePage(): Promise<JSX.Element> {
  const actor = await requirePagePermission('hr.read', 'tenant', 'leave');
  const companyId = actor.companyId as string;
  const permissions = getService('permissions');
  const canManage = await permissions.can(actor, 'hr.manage', { type: 'leave' });
  const canDecide = await permissions.can(actor, 'hr.leave.decide', { type: 'leave' });
  const year = new Date().getUTCFullYear();
  let data: {
    types: LeaveTypeView[];
    balances: BalanceView[];
    requests: RequestView[];
    people: EmployeeView[];
  } | null;
  try {
    const [types, balances, requests, people] = await Promise.all([
      listLeaveTypes(companyId),
      listBalances(companyId, { year }),
      listRequests(companyId),
      listEmployees(companyId).then((l) => l.filter((e) => e.status !== 'terminated')),
    ]);
    data = { types, balances, requests, people };
  } catch {
    data = null;
  }
  const done = t('s15Hr.common.done');
  const hint = t('s15Hr.common.dateHint');
  const nameOf = (id: string): string => {
    const e = data?.people.find((p) => p.id === id);
    return e ? `${e.firstName} ${e.lastName}` : '';
  };
  const typeOf = (id: string): string => data?.types.find((x) => x.id === id)?.name ?? '';
  const balanceColumns: readonly DataColumn<BalanceView>[] = [
    {
      key: 'employee',
      header: t('s15Hr.leave.columns.employee'),
      primary: true,
      cell: (r) => nameOf(r.employeeId),
    },
    { key: 'type', header: t('s15Hr.leave.columns.type'), cell: (r) => typeOf(r.leaveTypeId) },
    {
      key: 'entitled',
      header: t('s15Hr.leave.columns.entitled'),
      hideOnMobile: true,
      cell: (r) => r.entitled,
    },
    { key: 'used', header: t('s15Hr.leave.columns.used'), hideOnMobile: true, cell: (r) => r.used },
    {
      key: 'waiting',
      header: t('s15Hr.leave.columns.waiting'),
      hideOnMobile: true,
      cell: (r) => r.waiting,
    },
    {
      key: 'left',
      header: t('s15Hr.leave.columns.left'),
      cell: (r) => <span className="font-medium tabular-nums">{r.left}</span>,
    },
  ];
  const requestColumns: readonly DataColumn<RequestView>[] = [
    {
      key: 'employee',
      header: t('s15Hr.leave.requestColumns.employee'),
      primary: true,
      cell: (r) => r.employeeName,
    },
    {
      key: 'type',
      header: t('s15Hr.leave.requestColumns.type'),
      hideOnMobile: true,
      cell: (r) => typeOf(r.leaveTypeId),
    },
    {
      key: 'dates',
      header: t('s15Hr.leave.requestColumns.dates'),
      cell: (r) => `${r.startDate} - ${r.endDate}`,
    },
    { key: 'days', header: t('s15Hr.leave.requestColumns.days'), cell: (r) => r.days },
    {
      key: 'status',
      header: t('s15Hr.leave.requestColumns.status'),
      cell: (r) => (
        <span className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">{t(`s15Hr.leave.statuses.${r.status}` as StringKey)}</Badge>
          {canDecide && r.status === 'pending' ? (
            <>
              <ActionButton
                endpoint={`/api/hr/leave/requests/${r.id}/decide`}
                body={{ decision: 'approve' }}
                variant="default"
                label={t('s15Hr.leave.approve')}
                doneText={t('s15Hr.leave.decided')}
              />
              <ActionButton
                endpoint={`/api/hr/leave/requests/${r.id}/decide`}
                body={{ decision: 'reject', note: t('s15Hr.leave.rejectNote') }}
                label={t('s15Hr.leave.reject')}
                doneText={t('s15Hr.leave.decided')}
              />
            </>
          ) : null}
          {canDecide && (r.status === 'pending' || r.status === 'approved') ? (
            <ActionButton
              endpoint={`/api/hr/leave/requests/${r.id}`}
              method="DELETE"
              label={t('s15Hr.leave.cancel')}
              doneText={t('s15Hr.leave.decided')}
            />
          ) : null}
        </span>
      ),
    },
  ];
  const employeeOptions = (data?.people ?? []).map((e) => ({
    value: e.id,
    label: `${e.number} ${e.firstName} ${e.lastName}`,
  }));
  const typeOptions = (data?.types ?? [])
    .filter((x) => x.status === 'active')
    .map((x) => ({ value: x.id, label: x.name }));
  return (
    <div className="space-y-sp-24">
      <PageHeader title={t('s15Hr.leave.title')} description={t('s15Hr.leave.description')} />
      {data === null ? (
        <ErrorState description={t('s15Hr.common.loadError')} />
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle>{t('s15Hr.leave.requestsTitle')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-sp-12">
              <DataTable
                columns={requestColumns}
                rows={data.requests}
                getRowId={(r) => r.id}
                caption={t('s15Hr.leave.requestsTitle')}
                empty={<EmptyState title={t('s15Hr.common.empty')} />}
              />
              {canManage ? (
                <>
                  <h3 className="font-semibold">{t('s15Hr.leave.newTitle')}</h3>
                  <JsonForm
                    endpoint="/api/hr/leave/requests"
                    idempotent
                    resetAfter
                    submitLabel={t('s15Hr.leave.send')}
                    doneText={t('s15Hr.leave.sent')}
                    fields={[
                      {
                        name: 'employeeId',
                        label: t('s15Hr.leave.employee'),
                        kind: 'select',
                        required: true,
                        options: employeeOptions,
                      },
                      {
                        name: 'leaveTypeId',
                        label: t('s15Hr.leave.type'),
                        kind: 'select',
                        required: true,
                        options: typeOptions,
                      },
                      { name: 'startDate', label: t('s15Hr.leave.start'), hint, required: true },
                      { name: 'endDate', label: t('s15Hr.leave.end'), hint, required: true },
                      {
                        name: 'halfDay',
                        label: t('s15Hr.leave.halfDay'),
                        kind: 'checkbox',
                        initial: 'false',
                      },
                      { name: 'reason', label: t('s15Hr.leave.reason') },
                    ]}
                  />
                </>
              ) : null}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>
                {t('s15Hr.leave.balancesTitle')} {year}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-sp-12">
              <DataTable
                columns={balanceColumns}
                rows={data.balances}
                getRowId={(r) => r.id}
                caption={t('s15Hr.leave.balancesTitle')}
                empty={<EmptyState title={t('s15Hr.common.empty')} />}
              />
              {canManage ? (
                <>
                  <h3 className="font-semibold">{t('s15Hr.leave.generateTitle')}</h3>
                  <p className="text-sm text-muted-foreground">{t('s15Hr.leave.generateHelp')}</p>
                  <JsonForm
                    endpoint="/api/hr/leave/balances/generate"
                    idempotent
                    submitLabel={t('s15Hr.leave.generate')}
                    doneText={t('s15Hr.leave.generated')}
                    fields={[
                      {
                        name: 'year',
                        label: t('s15Hr.leave.year'),
                        whole: true,
                        initial: String(year),
                        required: true,
                      },
                    ]}
                  />
                  <h3 className="font-semibold">{t('s15Hr.leave.setTitle')}</h3>
                  <JsonForm
                    endpoint="/api/hr/leave/balances"
                    method="PUT"
                    submitLabel={t('s15Hr.leave.set')}
                    doneText={done}
                    fields={[
                      {
                        name: 'employeeId',
                        label: t('s15Hr.leave.employee'),
                        kind: 'select',
                        required: true,
                        options: employeeOptions,
                      },
                      {
                        name: 'leaveTypeId',
                        label: t('s15Hr.leave.type'),
                        kind: 'select',
                        required: true,
                        options: typeOptions,
                      },
                      {
                        name: 'year',
                        label: t('s15Hr.leave.year'),
                        whole: true,
                        initial: String(year),
                        required: true,
                      },
                      { name: 'entitled', label: t('s15Hr.leave.entitled'), required: true },
                    ]}
                  />
                </>
              ) : null}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>{t('s15Hr.leave.typesTitle')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-sp-12">
              <ul className="space-y-1 text-sm">
                {data.types.map((x) => (
                  <li key={x.id} className="flex flex-wrap items-center gap-2">
                    {x.name}: {x.annualDays}
                    {canManage ? (
                      <ActionButton
                        endpoint={`/api/hr/leave/types/${x.id}`}
                        method="PATCH"
                        body={{
                          version: x.version,
                          status: x.status === 'active' ? 'inactive' : 'active',
                        }}
                        label={
                          x.status === 'active'
                            ? t('s15Hr.common.deactivate')
                            : t('s15Hr.common.activate')
                        }
                        doneText={done}
                      />
                    ) : null}
                  </li>
                ))}
              </ul>
              {canManage ? (
                <JsonForm
                  endpoint="/api/hr/leave/types"
                  resetAfter
                  submitLabel={t('s15Hr.leave.typeAdd')}
                  doneText={done}
                  fields={[
                    { name: 'name', label: t('s15Hr.leave.typeName'), required: true },
                    { name: 'annualDays', label: t('s15Hr.leave.annualDays'), required: true },
                    { name: 'carryOverDays', label: t('s15Hr.leave.carryOver'), initial: '0' },
                    {
                      name: 'paid',
                      label: t('s15Hr.leave.paid'),
                      kind: 'checkbox',
                      initial: 'true',
                    },
                  ]}
                />
              ) : null}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
