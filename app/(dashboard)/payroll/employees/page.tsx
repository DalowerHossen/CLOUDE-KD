// path: app/(dashboard)/payroll/employees/page.tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import { z } from 'zod';
import { JsonForm } from '@/app/(dashboard)/wallet/_components/json-form';
import { CsvImportForm } from '@/components/accounting/csv-import-form';
import { DataTable, type DataColumn } from '@/components/shared/data-table';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState, ErrorState } from '@/components/shared/state-views';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { getService } from '@/lib/container';
import { t, type StringKey } from '@/lib/i18n';
import { requirePagePermission } from '@/services/base/page-guard';
import { CONTRACTS, PAY_BASES } from '@/services/payroll/payroll-rules';
import { listEmployees, type EmployeeView } from '@/services/payroll/employees';
import { listGrades, listStructures } from '@/services/payroll/structures';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Employees' };

const query = z.object({
  status: z.enum(['active', 'on_leave', 'terminated']).optional().catch(undefined),
  search: z.string().max(80).optional().catch(undefined),
});

export default async function EmployeesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<JSX.Element> {
  const actor = await requirePagePermission('payroll.employee.read', 'tenant', 'employee');
  const companyId = actor.companyId as string;
  const raw = await searchParams;
  const q = query.parse(
    Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v])),
  );
  const permissions = getService('permissions');
  const canManage = await permissions.can(actor, 'payroll.employee.manage', { type: 'employee' });
  let data: {
    rows: EmployeeView[];
    grades: Awaited<ReturnType<typeof listGrades>>;
    structures: Awaited<ReturnType<typeof listStructures>>;
  } | null;
  try {
    const [rows, grades, structures] = await Promise.all([
      listEmployees(companyId, {
        ...(q.status ? { status: q.status } : {}),
        ...(q.search ? { search: q.search } : {}),
      }),
      canManage ? listGrades(companyId) : Promise.resolve([]),
      canManage ? listStructures(companyId) : Promise.resolve([]),
    ]);
    data = { rows, grades, structures };
  } catch {
    data = null;
  }
  const hint = t('s15Payroll.common.dateHint');
  const columns: readonly DataColumn<EmployeeView>[] = [
    {
      key: 'number',
      header: t('s15Payroll.employees.columns.number'),
      hideOnMobile: true,
      cell: (r) => r.number,
    },
    {
      key: 'name',
      header: t('s15Payroll.employees.columns.name'),
      primary: true,
      cell: (r) => (
        <Link
          href={`/payroll/employees/${r.id}`}
          prefetch={false}
          className="font-medium underline"
        >
          {r.firstName} {r.lastName}
        </Link>
      ),
    },
    {
      key: 'dept',
      header: t('s15Payroll.employees.columns.department'),
      hideOnMobile: true,
      cell: (r) => r.department || '-',
    },
    {
      key: 'joined',
      header: t('s15Payroll.employees.columns.joined'),
      hideOnMobile: true,
      cell: (r) => r.joinDate,
    },
    {
      key: 'status',
      header: t('s15Payroll.employees.columns.status'),
      cell: (r) => (
        <Badge variant="outline">
          {t(`s15Payroll.employees.statuses.${r.status}` as StringKey)}
        </Badge>
      ),
    },
  ];
  return (
    <div className="space-y-sp-24">
      <PageHeader
        title={t('s15Payroll.employees.title')}
        description={t('s15Payroll.employees.description')}
        actions={
          canManage ? (
            <Button asChild variant="outline">
              <Link href="/api/payroll/employees/export" prefetch={false}>
                {t('s15Payroll.employees.exportCsv')}
              </Link>
            </Button>
          ) : null
        }
      />
      {data === null ? (
        <ErrorState description={t('s15Payroll.common.loadError')} />
      ) : (
        <>
          <form method="get" className="flex flex-wrap items-end gap-sp-8">
            <div className="space-y-1">
              <Label htmlFor="em-status">{t('s15Payroll.employees.status')}</Label>
              <NativeSelect id="em-status" name="status" defaultValue={q.status ?? ''}>
                <option value="">{t('s15Payroll.employees.all')}</option>
                {(['active', 'on_leave', 'terminated'] as const).map((s) => (
                  <option key={s} value={s}>
                    {t(`s15Payroll.employees.statuses.${s}` as StringKey)}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="space-y-1">
              <Label htmlFor="em-search">{t('s15Payroll.employees.search')}</Label>
              <Input id="em-search" name="search" defaultValue={q.search ?? ''} maxLength={80} />
            </div>
            <Button type="submit">{t('s15Payroll.common.apply')}</Button>
          </form>
          <DataTable
            columns={columns}
            rows={data.rows}
            getRowId={(r) => r.id}
            caption={t('s15Payroll.employees.title')}
            empty={<EmptyState title={t('s15Payroll.common.empty')} />}
          />
          {canManage ? (
            <>
              <Card>
                <CardHeader>
                  <CardTitle>{t('s15Payroll.employees.addTitle')}</CardTitle>
                </CardHeader>
                <CardContent>
                  <JsonForm
                    endpoint="/api/payroll/employees"
                    idempotent
                    resetAfter
                    submitLabel={t('s15Payroll.common.save')}
                    doneText={t('s15Payroll.common.done')}
                    fields={[
                      {
                        name: 'firstName',
                        label: t('s15Payroll.employees.fields.firstName'),
                        required: true,
                      },
                      {
                        name: 'lastName',
                        label: t('s15Payroll.employees.fields.lastName'),
                        required: true,
                      },
                      {
                        name: 'email',
                        label: t('s15Payroll.employees.fields.email'),
                        required: true,
                      },
                      { name: 'phone', label: t('s15Payroll.employees.fields.phone') },
                      { name: 'address', label: t('s15Payroll.employees.fields.address') },
                      {
                        name: 'dateOfBirth',
                        label: t('s15Payroll.employees.fields.dateOfBirth'),
                        hint,
                      },
                      { name: 'department', label: t('s15Payroll.employees.fields.department') },
                      { name: 'jobTitle', label: t('s15Payroll.employees.fields.jobTitle') },
                      {
                        name: 'joinDate',
                        label: t('s15Payroll.employees.fields.joinDate'),
                        hint,
                        required: true,
                      },
                      {
                        name: 'contractType',
                        label: t('s15Payroll.employees.fields.contractType'),
                        kind: 'select',
                        initial: 'full_time',
                        options: CONTRACTS.map((c) => ({
                          value: c,
                          label: t(`s15Payroll.employees.contracts.${c}` as StringKey),
                        })),
                      },
                      {
                        name: 'payBasis',
                        label: t('s15Payroll.employees.fields.payBasis'),
                        kind: 'select',
                        initial: 'monthly',
                        options: PAY_BASES.map((c) => ({
                          value: c,
                          label: t(`s15Payroll.employees.bases.${c}` as StringKey),
                        })),
                      },
                      {
                        name: 'gradeId',
                        label: t('s15Payroll.employees.fields.grade'),
                        kind: 'select',
                        initial: '',
                        options: [
                          { value: '', label: t('s15Payroll.employees.fields.none') },
                          ...data.grades.map((g) => ({ value: g.id, label: g.name })),
                        ],
                      },
                      {
                        name: 'structureId',
                        label: t('s15Payroll.employees.fields.structure'),
                        kind: 'select',
                        initial: '',
                        options: [
                          { value: '', label: t('s15Payroll.employees.fields.none') },
                          ...data.structures.map((s) => ({ value: s.id, label: s.name })),
                        ],
                      },
                      {
                        name: 'emergencyName',
                        label: t('s15Payroll.employees.fields.emergencyName'),
                      },
                      {
                        name: 'emergencyPhone',
                        label: t('s15Payroll.employees.fields.emergencyPhone'),
                      },
                      {
                        name: 'emergencyRelation',
                        label: t('s15Payroll.employees.fields.emergencyRelation'),
                      },
                    ]}
                  />
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>{t('s15Payroll.employees.importTitle')}</CardTitle>
                </CardHeader>
                <CardContent>
                  <CsvImportForm
                    endpoint="/api/payroll/employees/import"
                    help={t('s15Payroll.employees.importHelp')}
                    submitLabel={t('s15Payroll.employees.importButton')}
                    doneText={t('s15Payroll.employees.importDone')}
                  />
                </CardContent>
              </Card>
            </>
          ) : null}
        </>
      )}
    </div>
  );
}
