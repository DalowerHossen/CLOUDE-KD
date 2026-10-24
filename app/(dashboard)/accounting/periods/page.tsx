// path: app/(dashboard)/accounting/periods/page.tsx
import type { Metadata } from 'next';
import { ActionButton } from '@/app/(dashboard)/wallet/_components/action-button';
import { JsonForm } from '@/app/(dashboard)/wallet/_components/json-form';
import { PageHeader } from '@/components/shared/page-header';
import { ErrorState } from '@/components/shared/state-views';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getService } from '@/lib/container';
import { t, type StringKey } from '@/lib/i18n';
import { requirePagePermission } from '@/services/base/page-guard';
import {
  getSettings,
  listYears,
  periodChecklist,
  yearChecklist,
  type AccountingSettings,
  type YearChecklist,
  type YearView,
} from '@/services/accounting/periods';
import type { CheckItem } from '@/services/accounting/period-rules';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Periods' };

function Checklist({ items }: { items: readonly CheckItem[] }): JSX.Element {
  return (
    <ul className="list-disc pl-5 text-sm">
      {items.map((i) => (
        <li key={i.key} className={i.done ? 'text-muted-foreground' : 'font-medium'}>
          {i.label}
          {i.remaining !== null && !i.done ? ` (${i.remaining})` : ''}
        </li>
      ))}
    </ul>
  );
}

export default async function PeriodsPage(): Promise<JSX.Element> {
  const actor = await requirePagePermission('accounting.read', 'tenant', 'fiscal_period');
  const companyId = actor.companyId as string;
  const perms = getService('permissions');
  const [canManage, canReopen] = await Promise.all([
    perms.can(actor, 'accounting.period.manage', { type: 'fiscal_period' }),
    perms.can(actor, 'accounting.period.reopen', { type: 'fiscal_period' }),
  ]);
  let data: {
    settings: AccountingSettings;
    years: YearView[];
    nextCheck: { periodId: string; items: CheckItem[] } | null;
    yearCheck: { yearId: string; check: YearChecklist } | null;
  } | null;
  try {
    const [settings, years] = await Promise.all([getSettings(companyId), listYears(companyId)]);
    const openYear = [...years].reverse().find((y) => y.status === 'open');
    const openPeriod = openYear?.periods.find((p) => p.status === 'open');
    data = {
      settings,
      years,
      nextCheck: openPeriod
        ? { periodId: openPeriod.id, items: await periodChecklist(companyId, openPeriod.id) }
        : null,
      yearCheck: openYear
        ? { yearId: openYear.id, check: await yearChecklist(companyId, openYear.id) }
        : null,
    };
  } catch {
    data = null;
  }
  const today = new Date().toISOString().slice(0, 10);
  return (
    <div className="space-y-sp-24">
      <PageHeader
        title={t('s15Accounting.periods.title')}
        description={t('s15Accounting.periods.description')}
      />
      {data === null ? (
        <ErrorState description={t('s15Accounting.common.loadError')} />
      ) : (
        <>
          {data.years.length === 0 ? <Alert>{t('s15Accounting.periods.noYears')}</Alert> : null}
          {data.years.map((y) => (
            <Card key={y.id}>
              <CardHeader>
                <CardTitle className="flex flex-wrap items-center gap-2">
                  {y.label} ({y.startDate} - {y.endDate})
                  <Badge variant="outline">
                    {y.status === 'open'
                      ? t('s15Accounting.periods.open')
                      : t('s15Accounting.periods.closed')}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-sp-12">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <caption className="sr-only">{y.label}</caption>
                    <thead>
                      <tr className="text-left">
                        <th scope="col" className="py-1 pr-2">
                          {t('s15Accounting.periods.columns.month')}
                        </th>
                        <th scope="col" className="py-1 pr-2">
                          {t('s15Accounting.periods.columns.status')}
                        </th>
                        <th scope="col" className="py-1" />
                      </tr>
                    </thead>
                    <tbody>
                      {y.periods.map((p) => (
                        <tr key={p.id} className="border-t align-top">
                          <td className="py-1 pr-2">
                            {p.name}
                            {p.reopenCount > 0 ? (
                              <span className="text-muted-foreground">
                                {' '}
                                ({t('s15Accounting.periods.reopenedCount')} {p.reopenCount})
                              </span>
                            ) : null}
                          </td>
                          <td className="py-1 pr-2">
                            {p.status === 'open'
                              ? t('s15Accounting.periods.open')
                              : t('s15Accounting.periods.closed')}
                            {p.status === 'open' && p.arClosed
                              ? ` | ${t('s15Accounting.periods.lockAr')}`
                              : ''}
                            {p.status === 'open' && p.apClosed
                              ? ` | ${t('s15Accounting.periods.lockAp')}`
                              : ''}
                          </td>
                          <td className="space-y-1 py-1">
                            {canManage && p.status === 'open' ? (
                              <div className="flex flex-wrap gap-2">
                                <ActionButton
                                  endpoint={`/api/accounting/periods/${p.id}/lock`}
                                  body={{ module: 'ar', locked: !p.arClosed }}
                                  label={
                                    p.arClosed
                                      ? t('s15Accounting.periods.unlockAr')
                                      : t('s15Accounting.periods.lockAr')
                                  }
                                  doneText={t('s15Accounting.periods.done')}
                                />
                                <ActionButton
                                  endpoint={`/api/accounting/periods/${p.id}/lock`}
                                  body={{ module: 'ap', locked: !p.apClosed }}
                                  label={
                                    p.apClosed
                                      ? t('s15Accounting.periods.unlockAp')
                                      : t('s15Accounting.periods.lockAp')
                                  }
                                  doneText={t('s15Accounting.periods.done')}
                                />
                                <ActionButton
                                  endpoint={`/api/accounting/periods/${p.id}/close`}
                                  body={{ note: '' }}
                                  variant="default"
                                  label={t('s15Accounting.periods.close')}
                                  doneText={t('s15Accounting.periods.done')}
                                />
                              </div>
                            ) : null}
                            {canReopen && p.status === 'closed' && y.status === 'open' ? (
                              <JsonForm
                                endpoint={`/api/accounting/periods/${p.id}/reopen`}
                                idempotent
                                submitLabel={t('s15Accounting.periods.reopen')}
                                doneText={t('s15Accounting.periods.done')}
                                fields={[
                                  {
                                    name: 'reason',
                                    label: t('s15Accounting.periods.reopenReason'),
                                    required: true,
                                  },
                                ]}
                              />
                            ) : null}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {data.nextCheck && y.periods.some((p) => p.id === data.nextCheck?.periodId) ? (
                  <div>
                    <h3 className="font-semibold">{t('s15Accounting.periods.checklist')}</h3>
                    <Checklist items={data.nextCheck.items} />
                  </div>
                ) : null}
                {data.yearCheck && data.yearCheck.yearId === y.id ? (
                  <div className="space-y-sp-8">
                    <h3 className="font-semibold">
                      {t('s15Accounting.periods.yearClose')} |{' '}
                      {t('s15Accounting.periods.netIncome')}: {data.yearCheck.check.netIncome} USD
                    </h3>
                    <Checklist items={data.yearCheck.check.items} />
                    {canManage && data.yearCheck.check.ready ? (
                      <JsonForm
                        endpoint={`/api/accounting/years/${y.id}/close`}
                        idempotent
                        submitLabel={t('s15Accounting.periods.yearClose')}
                        doneText={t('s15Accounting.periods.done')}
                        fields={[{ name: 'note', label: t('s15Accounting.periods.closeNote') }]}
                      />
                    ) : null}
                  </div>
                ) : null}
                {canReopen && y.status === 'closed' ? (
                  <JsonForm
                    endpoint={`/api/accounting/years/${y.id}/reopen`}
                    idempotent
                    submitLabel={t('s15Accounting.periods.yearReopen')}
                    doneText={t('s15Accounting.periods.done')}
                    fields={[
                      {
                        name: 'reason',
                        label: t('s15Accounting.periods.reopenReason'),
                        required: true,
                      },
                    ]}
                  />
                ) : null}
              </CardContent>
            </Card>
          ))}
          {canManage ? (
            <>
              <Card>
                <CardHeader>
                  <CardTitle>{t('s15Accounting.periods.setupTitle')}</CardTitle>
                </CardHeader>
                <CardContent>
                  <JsonForm
                    endpoint="/api/accounting/periods"
                    submitLabel={t('s15Accounting.periods.setup')}
                    doneText={t('s15Accounting.periods.done')}
                    fields={[
                      {
                        name: 'date',
                        label: t('s15Accounting.periods.setupDate'),
                        initial: today,
                        required: true,
                      },
                    ]}
                  />
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>{t('s15Accounting.periods.settingsTitle')}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-sp-8">
                  <p className="text-sm text-muted-foreground">
                    {t('s15Accounting.periods.stepUp')}
                  </p>
                  <JsonForm
                    endpoint="/api/accounting/settings"
                    method="PUT"
                    emptyAsNull
                    submitLabel={t('s15Accounting.common.save')}
                    doneText={t('s15Accounting.periods.saved')}
                    fields={[
                      {
                        name: 'fiscalStartMonth',
                        label: t('s15Accounting.periods.startMonth'),
                        whole: true,
                        initial: String(data.settings.fiscalStartMonth),
                        hint: '1 - 12',
                      },
                      {
                        name: 'closedPeriodPolicy',
                        label: t('s15Accounting.periods.policy'),
                        kind: 'select',
                        initial: data.settings.closedPeriodPolicy,
                        options: (['next_open', 'fail'] as const).map((p) => ({
                          value: p,
                          label: t(`s15Accounting.periods.policies.${p}` as StringKey),
                        })),
                      },
                      {
                        name: 'lockDate',
                        label: t('s15Accounting.periods.lockDate'),
                        initial: data.settings.lockDate ?? '',
                        hint: 'YYYY-MM-DD',
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
