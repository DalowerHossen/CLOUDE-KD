// path: app/(dashboard)/hr/page.tsx
import type { Metadata } from 'next';
import { ActionButton } from '@/app/(dashboard)/wallet/_components/action-button';
import { JsonForm } from '@/app/(dashboard)/wallet/_components/json-form';
import { PageHeader } from '@/components/shared/page-header';
import { ErrorState } from '@/components/shared/state-views';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getService } from '@/lib/container';
import { t } from '@/lib/i18n';
import { requirePagePermission } from '@/services/base/page-guard';
import { listEmployees, type EmployeeView } from '@/services/payroll/employees';
import type { OrgNode } from '@/services/hr/hr-rules';
import {
  listDepartments,
  listPositions,
  orgChart,
  type DepartmentView,
  type OrgChart,
  type PositionView,
} from '@/services/hr/org';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Organisation' };

function Tree({ nodes }: { nodes: readonly OrgNode[] }): JSX.Element | null {
  if (nodes.length === 0) return null;
  return (
    <ul className="space-y-1 border-l pl-sp-12 text-sm">
      {nodes.map((n) => (
        <li key={n.id}>
          {n.label}
          <Tree nodes={n.children} />
        </li>
      ))}
    </ul>
  );
}

export default async function OrgPage(): Promise<JSX.Element> {
  const actor = await requirePagePermission('hr.read', 'tenant', 'department');
  const companyId = actor.companyId as string;
  const canManage = await getService('permissions').can(actor, 'hr.manage', { type: 'department' });
  let data: {
    departments: DepartmentView[];
    positions: PositionView[];
    chart: OrgChart;
    people: EmployeeView[];
  } | null;
  try {
    const [departments, positions, chart, people] = await Promise.all([
      listDepartments(companyId),
      listPositions(companyId),
      orgChart(companyId),
      listEmployees(companyId).then((l) => l.filter((e) => e.status !== 'terminated')),
    ]);
    data = { departments, positions, chart, people };
  } catch {
    data = null;
  }
  const done = t('s15Hr.common.done');
  const none = { value: '', label: t('s15Hr.common.none') };
  return (
    <div className="space-y-sp-24">
      <PageHeader title={t('s15Hr.org.title')} description={t('s15Hr.org.description')} />
      {data === null ? (
        <ErrorState description={t('s15Hr.common.loadError')} />
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle>{t('s15Hr.org.chartTitle')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-sp-12">
              <Tree nodes={data.chart.byDepartment} />
              {data.departments.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t('s15Hr.common.empty')}</p>
              ) : null}
              {canManage ? (
                <ul className="space-y-1 text-sm">
                  {data.departments.map((d) => (
                    <li key={d.id} className="flex flex-wrap items-center gap-2">
                      {d.name}
                      <ActionButton
                        endpoint={`/api/hr/departments/${d.id}`}
                        method="DELETE"
                        label={t('s15Hr.common.remove')}
                        doneText={done}
                      />
                    </li>
                  ))}
                </ul>
              ) : null}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>{t('s15Hr.org.reportingTitle')}</CardTitle>
            </CardHeader>
            <CardContent>
              <Tree nodes={data.chart.byReporting} />
              {data.chart.byReporting.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t('s15Hr.common.empty')}</p>
              ) : null}
            </CardContent>
          </Card>
          {canManage ? (
            <>
              <Card>
                <CardHeader>
                  <CardTitle>{t('s15Hr.org.departmentsTitle')}</CardTitle>
                </CardHeader>
                <CardContent>
                  <JsonForm
                    endpoint="/api/hr/departments"
                    resetAfter
                    submitLabel={t('s15Hr.org.departmentAdd')}
                    doneText={done}
                    fields={[
                      { name: 'name', label: t('s15Hr.org.name'), required: true },
                      {
                        name: 'parentId',
                        label: t('s15Hr.org.parent'),
                        kind: 'select',
                        initial: '',
                        options: [
                          none,
                          ...data.departments.map((d) => ({ value: d.id, label: d.name })),
                        ],
                      },
                      {
                        name: 'headEmployeeId',
                        label: t('s15Hr.org.head'),
                        kind: 'select',
                        initial: '',
                        options: [
                          none,
                          ...data.people.map((e) => ({
                            value: e.id,
                            label: `${e.firstName} ${e.lastName}`,
                          })),
                        ],
                      },
                    ]}
                  />
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>{t('s15Hr.org.positionsTitle')}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-sp-12">
                  <ul className="space-y-1 text-sm">
                    {data.positions.map((p) => (
                      <li key={p.id} className="flex flex-wrap items-center gap-2">
                        {p.title}
                        <ActionButton
                          endpoint={`/api/hr/positions/${p.id}`}
                          method="DELETE"
                          label={t('s15Hr.common.remove')}
                          doneText={done}
                        />
                      </li>
                    ))}
                  </ul>
                  <JsonForm
                    endpoint="/api/hr/positions"
                    resetAfter
                    submitLabel={t('s15Hr.org.positionAdd')}
                    doneText={done}
                    fields={[
                      { name: 'title', label: t('s15Hr.org.positionTitle'), required: true },
                      {
                        name: 'departmentId',
                        label: t('s15Hr.org.department'),
                        kind: 'select',
                        initial: '',
                        options: [
                          none,
                          ...data.departments.map((d) => ({ value: d.id, label: d.name })),
                        ],
                      },
                    ]}
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
