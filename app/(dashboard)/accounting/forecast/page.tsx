// path: app/(dashboard)/accounting/forecast/page.tsx
import type { Metadata } from 'next';
import { JsonForm } from '@/app/(dashboard)/wallet/_components/json-form';
import { DataTable, type DataColumn } from '@/components/shared/data-table';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState, ErrorState } from '@/components/shared/state-views';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getService } from '@/lib/container';
import { t } from '@/lib/i18n';
import { Money } from '@/lib/utils/currency';
import { requirePagePermission } from '@/services/base/page-guard';
import {
  cashForecast,
  getForecastSettings,
  trendForecasts,
  type CashForecast,
  type ForecastSettings,
  type TrendForecast,
} from '@/services/budget/forecast';
import type { ProjectionWeek } from '@/services/budget/forecast-rules';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Cash forecast' };

interface TrendRow {
  month: string;
  kind: string;
  revenue: string;
  expenses: string;
  result: string;
}

const money = (v: string): JSX.Element => (
  <span className="block text-right tabular-nums">{v}</span>
);

export default async function ForecastPage(): Promise<JSX.Element> {
  const actor = await requirePagePermission('accounting.read', 'tenant', 'forecast');
  const companyId = actor.companyId as string;
  const canManage = await getService('permissions').can(actor, 'accounting.budget.manage', {
    type: 'forecast',
  });
  let data: { cash: CashForecast; trend: TrendForecast; settings: ForecastSettings } | null;
  try {
    const [cash, trend, settings] = await Promise.all([
      cashForecast(companyId),
      trendForecasts(companyId),
      getForecastSettings(companyId),
    ]);
    data = { cash, trend, settings };
  } catch {
    data = null;
  }
  const weekColumns: readonly DataColumn<ProjectionWeek>[] = [
    {
      key: 'date',
      header: t('s15Accounting.forecast.weekColumns.date'),
      primary: true,
      cell: (r) => r.date,
    },
    {
      key: 'in',
      header: t('s15Accounting.forecast.weekColumns.inflow'),
      cell: (r) => money(r.inflow),
    },
    {
      key: 'out',
      header: t('s15Accounting.forecast.weekColumns.outflow'),
      cell: (r) => money(r.outflow),
    },
    {
      key: 'bal',
      header: t('s15Accounting.forecast.weekColumns.balance'),
      cell: (r) => money(r.balance),
    },
  ];
  const trendRows: TrendRow[] = data
    ? [
        ...data.trend.history.map((h) => ({
          month: h.month,
          kind: t('s15Accounting.forecast.actual'),
          revenue: h.revenue,
          expenses: h.expenses,
          result: Money.parse(h.revenue).sub(h.expenses).toDbString(),
        })),
        ...data.trend.forecast.map((h) => ({
          month: h.month,
          kind: t('s15Accounting.forecast.forecastKind'),
          revenue: h.revenue,
          expenses: h.expenses,
          result: h.result,
        })),
      ]
    : [];
  const trendColumns: readonly DataColumn<TrendRow>[] = [
    {
      key: 'month',
      header: t('s15Accounting.forecast.trendColumns.month'),
      primary: true,
      cell: (r) => r.month,
    },
    {
      key: 'kind',
      header: t('s15Accounting.forecast.trendColumns.kind'),
      hideOnMobile: true,
      cell: (r) => r.kind,
    },
    {
      key: 'rev',
      header: t('s15Accounting.forecast.trendColumns.revenue'),
      cell: (r) => money(r.revenue),
    },
    {
      key: 'exp',
      header: t('s15Accounting.forecast.trendColumns.expenses'),
      cell: (r) => money(r.expenses),
    },
    {
      key: 'res',
      header: t('s15Accounting.forecast.trendColumns.result'),
      hideOnMobile: true,
      cell: (r) => money(r.result),
    },
  ];
  const links = (kind: 'cash' | 'trend', label: string): JSX.Element => (
    <>
      {(['csv', 'xlsx', 'pdf'] as const).map((f) => (
        <Button key={f} asChild variant="outline">
          <a href={`/api/accounting/forecast/export?kind=${kind}&format=${f}`}>
            {label} (
            {f === 'csv'
              ? t('s15Accounting.common.csv')
              : f === 'xlsx'
                ? t('s15Accounting.common.excel')
                : t('s15Accounting.common.pdf')}
            )
          </a>
        </Button>
      ))}
    </>
  );
  return (
    <div className="space-y-sp-24">
      <PageHeader
        title={t('s15Accounting.forecast.title')}
        description={t('s15Accounting.forecast.description')}
      />
      {data === null ? (
        <ErrorState description={t('s15Accounting.forecast.loadError')} />
      ) : (
        <>
          {data.cash.lowCash ? (
            <Alert variant="destructive">{t('s15Accounting.forecast.lowWarning')}</Alert>
          ) : null}
          <Card>
            <CardContent className="grid gap-sp-12 pt-sp-16 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <p className="text-sm text-muted-foreground">
                  {t('s15Accounting.forecast.cashToday')}
                </p>
                <p className="text-lg font-semibold tabular-nums">{data.cash.openingCash}</p>
              </div>
              {data.cash.projection.horizons.map((h) => (
                <div key={h.days}>
                  <p className="text-sm text-muted-foreground">
                    {t('s15Accounting.forecast.inDays', { days: h.days })}
                  </p>
                  <p className="text-lg font-semibold tabular-nums">{h.endCash}</p>
                </div>
              ))}
              <div>
                <p className="text-sm text-muted-foreground">
                  {t('s15Accounting.forecast.lowest')}
                </p>
                <p className="font-semibold tabular-nums">
                  {data.cash.projection.lowest.balance} {t('s15Accounting.forecast.around')}{' '}
                  {data.cash.projection.lowest.date}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">
                  {t('s15Accounting.forecast.runway')}
                </p>
                <p className="font-semibold">
                  {data.cash.runwayMonths === null
                    ? t('s15Accounting.forecast.notBurning')
                    : `${data.cash.runwayMonths} ${t('s15Accounting.forecast.months')}`}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{t('s15Accounting.forecast.burn')}</p>
                <p className="font-semibold tabular-nums">{data.cash.monthlyBurn}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>{t('s15Accounting.forecast.weeksTitle')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-sp-12">
              <div className="flex flex-wrap gap-sp-8">
                {links('cash', t('s15Accounting.forecast.cashFile'))}
              </div>
              <DataTable
                columns={weekColumns}
                rows={data.cash.projection.weeks}
                getRowId={(r) => r.date}
                caption={t('s15Accounting.forecast.weeksTitle')}
                empty={<EmptyState title={t('s15Accounting.common.empty')} />}
              />
              {data.cash.notes.map((n) => (
                <p key={n} className="text-sm text-muted-foreground">
                  {n}
                </p>
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>{t('s15Accounting.forecast.trendTitle')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-sp-12">
              <div className="flex flex-wrap gap-sp-8">
                {links('trend', t('s15Accounting.forecast.trendFile'))}
              </div>
              <DataTable
                columns={trendColumns}
                rows={trendRows}
                getRowId={(r) => `${r.kind}-${r.month}`}
                caption={t('s15Accounting.forecast.trendTitle')}
                empty={<EmptyState title={t('s15Accounting.common.empty')} />}
              />
            </CardContent>
          </Card>
          {canManage ? (
            <Card>
              <CardHeader>
                <CardTitle>{t('s15Accounting.forecast.settingsTitle')}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-sp-12">
                <p className="text-sm text-muted-foreground">
                  {t('s15Accounting.forecast.settingsHelp')}
                </p>
                <JsonForm
                  endpoint="/api/accounting/forecast/settings"
                  method="PUT"
                  fixed={data.settings.version === null ? {} : { version: data.settings.version }}
                  submitLabel={t('s15Accounting.common.save')}
                  doneText={t('s15Accounting.forecast.saved')}
                  fields={[
                    {
                      name: 'lowCashThreshold',
                      label: t('s15Accounting.forecast.threshold'),
                      initial: data.settings.lowCashThreshold,
                      required: true,
                    },
                    {
                      name: 'lateDays',
                      label: t('s15Accounting.forecast.lateDays'),
                      whole: true,
                      initial: String(data.settings.lateDays),
                      required: true,
                    },
                    {
                      name: 'alertsEnabled',
                      label: t('s15Accounting.forecast.alerts'),
                      kind: 'checkbox',
                      initial: String(data.settings.alertsEnabled),
                    },
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
