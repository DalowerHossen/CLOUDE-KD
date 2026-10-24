// path: app/(dashboard)/payroll/structures/page.tsx
import type { Metadata } from 'next';
import { ActionButton } from '@/app/(dashboard)/wallet/_components/action-button';
import { JsonForm } from '@/app/(dashboard)/wallet/_components/json-form';
import { PageHeader } from '@/components/shared/page-header';
import { ErrorState } from '@/components/shared/state-views';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { t, type StringKey } from '@/lib/i18n';
import { requirePagePermission } from '@/services/base/page-guard';
import { PAY_BASES } from '@/services/payroll/payroll-rules';
import {
  listComponents,
  listGrades,
  listStructures,
  type ComponentView,
  type GradeView,
  type StructureView,
} from '@/services/payroll/structures';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Salary structures' };

export default async function StructuresPage(): Promise<JSX.Element> {
  const actor = await requirePagePermission(
    'payroll.settings.manage',
    'tenant',
    'salary_structure',
  );
  const companyId = actor.companyId as string;
  let data: {
    grades: GradeView[];
    components: ComponentView[];
    structures: StructureView[];
  } | null;
  try {
    const [grades, components, structures] = await Promise.all([
      listGrades(companyId),
      listComponents(companyId),
      listStructures(companyId),
    ]);
    data = { grades, components, structures };
  } catch {
    data = null;
  }
  const done = t('s15Payroll.common.done');
  const nameOf = (id: string): string => data?.components.find((c) => c.id === id)?.name ?? '';
  return (
    <div className="space-y-sp-24">
      <PageHeader
        title={t('s15Payroll.structures.title')}
        description={t('s15Payroll.structures.description')}
      />
      {data === null ? (
        <ErrorState description={t('s15Payroll.common.loadError')} />
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle>{t('s15Payroll.structures.gradesTitle')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-sp-12">
              {data.grades.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t('s15Payroll.structures.empty')}</p>
              ) : (
                <ul className="space-y-1 text-sm">
                  {data.grades.map((g) => (
                    <li key={g.id} className="flex flex-wrap items-center gap-2">
                      {g.name}: {g.minAmount} - {g.maxAmount}
                      <ActionButton
                        endpoint={`/api/payroll/grades/${g.id}`}
                        method="DELETE"
                        label={t('s15Payroll.common.remove')}
                        doneText={done}
                      />
                    </li>
                  ))}
                </ul>
              )}
              <JsonForm
                endpoint="/api/payroll/grades"
                resetAfter
                submitLabel={t('s15Payroll.structures.gradeAdd')}
                doneText={done}
                fields={[
                  { name: 'name', label: t('s15Payroll.structures.gradeName'), required: true },
                  {
                    name: 'minAmount',
                    label: t('s15Payroll.structures.minAmount'),
                    required: true,
                  },
                  {
                    name: 'maxAmount',
                    label: t('s15Payroll.structures.maxAmount'),
                    required: true,
                  },
                ]}
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>{t('s15Payroll.structures.componentsTitle')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-sp-12">
              {data.components.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t('s15Payroll.structures.empty')}</p>
              ) : (
                <ul className="space-y-1 text-sm">
                  {data.components.map((c) => (
                    <li key={c.id} className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{c.code}</span> {c.name}
                      <Badge variant="outline">
                        {t(`s15Payroll.structures.kinds.${c.kind}` as StringKey)}
                      </Badge>
                      <span className="text-muted-foreground">
                        {t(`s15Payroll.structures.calcTypes.${c.calcType}` as StringKey)}: {c.value}
                      </span>
                      {c.status === 'inactive' ? (
                        <Badge variant="outline">{t('s15Payroll.settings.inactive')}</Badge>
                      ) : null}
                      <ActionButton
                        endpoint={`/api/payroll/components/${c.id}`}
                        method="PATCH"
                        body={{
                          version: c.version,
                          status: c.status === 'active' ? 'inactive' : 'active',
                        }}
                        label={
                          c.status === 'active'
                            ? t('s15Payroll.common.deactivate')
                            : t('s15Payroll.common.activate')
                        }
                        doneText={done}
                      />
                    </li>
                  ))}
                </ul>
              )}
              <JsonForm
                endpoint="/api/payroll/components"
                resetAfter
                submitLabel={t('s15Payroll.structures.componentAdd')}
                doneText={done}
                fields={[
                  { name: 'code', label: t('s15Payroll.structures.code'), required: true },
                  { name: 'name', label: t('s15Payroll.structures.name'), required: true },
                  {
                    name: 'kind',
                    label: t('s15Payroll.structures.kind'),
                    kind: 'select',
                    initial: 'earning',
                    options: (['earning', 'deduction'] as const).map((k) => ({
                      value: k,
                      label: t(`s15Payroll.structures.kinds.${k}` as StringKey),
                    })),
                  },
                  {
                    name: 'calcType',
                    label: t('s15Payroll.structures.calcType'),
                    kind: 'select',
                    initial: 'fixed',
                    options: (['fixed', 'percent_of_basic', 'percent_of_gross'] as const).map(
                      (k) => ({
                        value: k,
                        label: t(`s15Payroll.structures.calcTypes.${k}` as StringKey),
                      }),
                    ),
                  },
                  {
                    name: 'defaultValue',
                    label: t('s15Payroll.structures.defaultValue'),
                    initial: '0',
                  },
                  {
                    name: 'taxable',
                    label: t('s15Payroll.structures.taxable'),
                    kind: 'checkbox',
                    initial: 'true',
                  },
                  {
                    name: 'preTax',
                    label: t('s15Payroll.structures.preTax'),
                    kind: 'checkbox',
                    initial: 'false',
                  },
                ]}
              />
              <p className="text-sm text-muted-foreground">
                {t('s15Payroll.structures.valueHelp')}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>{t('s15Payroll.structures.structuresTitle')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-sp-12">
              {data.structures.map((s) => (
                <div key={s.id} className="space-y-1 rounded-md border p-sp-12">
                  <h3 className="font-semibold">
                    {s.name}{' '}
                    <span className="text-sm font-normal text-muted-foreground">
                      ({t(`s15Payroll.employees.bases.${s.payBasis}` as StringKey)})
                    </span>
                  </h3>
                  {s.description ? (
                    <p className="text-sm text-muted-foreground">{s.description}</p>
                  ) : null}
                  <ul className="space-y-1 text-sm">
                    {s.items.map((i) => (
                      <li key={i.id} className="flex flex-wrap items-center gap-2">
                        {nameOf(i.componentId)}: {i.value}
                        <ActionButton
                          endpoint={`/api/payroll/structures/${s.id}/items/${i.id}`}
                          method="DELETE"
                          label={t('s15Payroll.common.remove')}
                          doneText={done}
                        />
                      </li>
                    ))}
                  </ul>
                  <JsonForm
                    endpoint={`/api/payroll/structures/${s.id}/items`}
                    submitLabel={t('s15Payroll.structures.itemAdd')}
                    doneText={done}
                    fields={[
                      {
                        name: 'componentId',
                        label: t('s15Payroll.structures.component'),
                        kind: 'select',
                        required: true,
                        options: data.components
                          .filter((c) => c.status === 'active')
                          .map((c) => ({ value: c.id, label: `${c.code} ${c.name}` })),
                      },
                      { name: 'value', label: t('s15Payroll.structures.value'), required: true },
                    ]}
                  />
                </div>
              ))}
              <JsonForm
                endpoint="/api/payroll/structures"
                resetAfter
                submitLabel={t('s15Payroll.structures.structureAdd')}
                doneText={done}
                fields={[
                  { name: 'name', label: t('s15Payroll.structures.name'), required: true },
                  {
                    name: 'payBasis',
                    label: t('s15Payroll.structures.payBasis'),
                    kind: 'select',
                    initial: 'monthly',
                    options: PAY_BASES.map((b) => ({
                      value: b,
                      label: t(`s15Payroll.employees.bases.${b}` as StringKey),
                    })),
                  },
                  {
                    name: 'gradeId',
                    label: t('s15Payroll.structures.grade'),
                    kind: 'select',
                    initial: '',
                    options: [
                      { value: '', label: t('s15Payroll.employees.fields.none') },
                      ...data.grades.map((g) => ({ value: g.id, label: g.name })),
                    ],
                  },
                  { name: 'description', label: t('s15Payroll.structures.description2') },
                ]}
              />
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
