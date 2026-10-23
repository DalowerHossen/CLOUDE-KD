// path: app/(dashboard)/hr/checklists/page.tsx
import type { Metadata } from 'next';
import { ActionButton } from '@/app/(dashboard)/wallet/_components/action-button';
import { JsonForm } from '@/app/(dashboard)/wallet/_components/json-form';
import { PageHeader } from '@/components/shared/page-header';
import { ErrorState } from '@/components/shared/state-views';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getService } from '@/lib/container';
import { t, type StringKey } from '@/lib/i18n';
import { requirePagePermission } from '@/services/base/page-guard';
import { listEmployees, type EmployeeView } from '@/services/payroll/employees';
import {
  listChecklists,
  listTemplates,
  type ChecklistView,
  type TemplateView,
} from '@/services/hr/checklists';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Checklists' };

export default async function ChecklistsPage(): Promise<JSX.Element> {
  const actor = await requirePagePermission('hr.read', 'tenant', 'checklist');
  const companyId = actor.companyId as string;
  const canManage = await getService('permissions').can(actor, 'hr.manage', { type: 'checklist' });
  let data: { lists: ChecklistView[]; templates: TemplateView[]; people: EmployeeView[] } | null;
  try {
    const [lists, templates, people] = await Promise.all([
      listChecklists(companyId),
      listTemplates(companyId),
      listEmployees(companyId),
    ]);
    data = { lists, templates, people };
  } catch {
    data = null;
  }
  const done = t('s15Hr.common.done');
  return (
    <div className="space-y-sp-24">
      <PageHeader
        title={t('s15Hr.checklists.title')}
        description={t('s15Hr.checklists.description')}
      />
      {data === null ? (
        <ErrorState description={t('s15Hr.common.loadError')} />
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle>{t('s15Hr.checklists.listsTitle')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-sp-16">
              {data.lists.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t('s15Hr.common.empty')}</p>
              ) : null}
              {data.lists.map((l) => (
                <div key={l.id} className="space-y-1 rounded-md border p-sp-12">
                  <h3 className="flex flex-wrap items-center gap-2 font-semibold">
                    {l.employeeName}: {l.name}
                    <Badge variant="outline">
                      {t(`s15Hr.checklists.kinds.${l.kind}` as StringKey)}
                    </Badge>
                    <Badge variant="outline">
                      {t(`s15Hr.checklists.statuses.${l.status}` as StringKey)}
                    </Badge>
                  </h3>
                  <ul className="space-y-1 text-sm">
                    {l.items.map((i) => (
                      <li key={i.id} className="flex flex-wrap items-center gap-2">
                        <span className={i.done ? 'text-muted-foreground line-through' : undefined}>
                          {i.title}
                        </span>
                        {i.dueOn ? (
                          <span className="text-xs text-muted-foreground">
                            {t('s15Hr.checklists.due')} {i.dueOn}
                          </span>
                        ) : null}
                        {canManage ? (
                          <ActionButton
                            endpoint={`/api/hr/checklists/items/${i.id}`}
                            method="PUT"
                            body={{ done: !i.done }}
                            label={
                              i.done ? t('s15Hr.checklists.untick') : t('s15Hr.checklists.tick')
                            }
                            doneText={done}
                          />
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
              {canManage ? (
                <>
                  <h3 className="font-semibold">{t('s15Hr.checklists.createTitle')}</h3>
                  <JsonForm
                    endpoint="/api/hr/checklists"
                    resetAfter
                    submitLabel={t('s15Hr.checklists.create')}
                    doneText={done}
                    fields={[
                      {
                        name: 'employeeId',
                        label: t('s15Hr.checklists.employee'),
                        kind: 'select',
                        required: true,
                        options: data.people.map((e) => ({
                          value: e.id,
                          label: `${e.number} ${e.firstName} ${e.lastName}`,
                        })),
                      },
                      {
                        name: 'kind',
                        label: t('s15Hr.checklists.kind'),
                        kind: 'select',
                        initial: 'onboarding',
                        options: (['onboarding', 'offboarding'] as const).map((k) => ({
                          value: k,
                          label: t(`s15Hr.checklists.kinds.${k}` as StringKey),
                        })),
                      },
                    ]}
                  />
                </>
              ) : null}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>{t('s15Hr.checklists.templatesTitle')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-sp-12">
              {data.templates.length === 0 && canManage ? (
                <ActionButton
                  endpoint="/api/hr/checklists/templates/seed"
                  variant="default"
                  label={t('s15Hr.checklists.seed')}
                  doneText={done}
                />
              ) : null}
              {data.templates.map((tpl) => (
                <div key={tpl.id} className="text-sm">
                  <span className="font-medium">{tpl.name}</span> (
                  {t(`s15Hr.checklists.kinds.${tpl.kind}` as StringKey)}):{' '}
                  {tpl.items.map((i) => i.title).join('; ')}
                </div>
              ))}
              {canManage ? (
                <JsonForm
                  endpoint="/api/hr/checklists/templates"
                  resetAfter
                  submitLabel={t('s15Hr.checklists.templateAdd')}
                  doneText={done}
                  fields={[
                    {
                      name: 'kind',
                      label: t('s15Hr.checklists.kind'),
                      kind: 'select',
                      initial: 'onboarding',
                      options: (['onboarding', 'offboarding'] as const).map((k) => ({
                        value: k,
                        label: t(`s15Hr.checklists.kinds.${k}` as StringKey),
                      })),
                    },
                    { name: 'name', label: t('s15Hr.checklists.name'), required: true },
                    {
                      name: 'items',
                      label: t('s15Hr.checklists.items'),
                      list: true,
                      required: true,
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
