// path: app/(admin)/admin/revenue/page.tsx
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { DataTable, type DataColumn } from '@/components/shared/data-table';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState, ErrorState } from '@/components/shared/state-views';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getService } from '@/lib/container';
import { t, type StringKey } from '@/lib/i18n';
import {
  moneyFlowReport,
  revenueReport,
  tenantHealth,
  type MoneyFlowReport,
  type RevenueReport,
  type TenantHealth,
} from '@/services/subscription/analytics';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Revenue' };

const DAY = 86_400_000;

interface Stat {
  label: string;
  value: string;
}

function Stats({ items }: { items: readonly Stat[] }): JSX.Element {
  return (
    <dl className="grid gap-sp-12 sm:grid-cols-3 lg:grid-cols-4">
      {items.map((s) => (
        <div key={s.label}>
          <dt className="text-muted-foreground">{s.label}</dt>
          <dd className="font-semibold">{s.value}</dd>
        </div>
      ))}
    </dl>
  );
}

interface Pair {
  id: string;
  key: string;
  amount: string;
}

const pairColumns: readonly DataColumn<Pair>[] = [
  { key: 'key', header: t('s14Wallet.revenue.columns.key'), primary: true, cell: (r) => r.key },
  { key: 'amount', header: t('s14Wallet.revenue.columns.amount'), cell: (r) => r.amount },
];

const healthColumns: readonly DataColumn<TenantHealth>[] = [
  { key: 'name', header: t('s14Wallet.revenue.columns.name'), primary: true, cell: (r) => r.name },
  {
    key: 'plan',
    header: t('s14Wallet.revenue.columns.plan'),
    hideOnMobile: true,
    cell: (r) => r.plan,
  },
  { key: 'score', header: t('s14Wallet.revenue.columns.score'), cell: (r) => String(r.score) },
  {
    key: 'risk',
    header: t('s14Wallet.revenue.columns.risk'),
    cell: (r) => (
      <Badge variant="outline">{t(`s14Wallet.revenue.risks.${r.risk}` as StringKey)}</Badge>
    ),
  },
  {
    key: 'why',
    header: t('s14Wallet.revenue.columns.why'),
    hideOnMobile: true,
    cell: (r) => r.reasons.join(' '),
  },
];

export default async function RevenuePage(): Promise<JSX.Element> {
  const actor = await getService('auth').getActor();
  if (!actor || !['super_admin', 'ceo', 'admin_staff'].includes(actor.role)) notFound();
  const now = new Date();
  const from = new Date(now.getTime() - 90 * DAY).toISOString().slice(0, 10);
  const to = new Date(now.getTime() + DAY).toISOString().slice(0, 10);
  let data: { revenue: RevenueReport; flow: MoneyFlowReport; health: TenantHealth[] } | null;
  try {
    const [revenue, flow, health] = await Promise.all([
      revenueReport(from, to),
      moneyFlowReport(from, to),
      tenantHealth(50),
    ]);
    data = { revenue, flow, health };
  } catch {
    data = null;
  }
  const none = t('s14Wallet.revenue.none');
  return (
    <div className="space-y-sp-24">
      <PageHeader
        title={t('s14Wallet.revenue.title')}
        description={t('s14Wallet.revenue.description')}
      />
      {data === null ? (
        <ErrorState description={t('s14Wallet.revenue.loadError')} />
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle>{t('s14Wallet.revenue.period')}</CardTitle>
            </CardHeader>
            <CardContent>
              <Stats
                items={[
                  { label: t('s14Wallet.revenue.mrr'), value: data.revenue.mrr },
                  { label: t('s14Wallet.revenue.arr'), value: data.revenue.arr },
                  {
                    label: t('s14Wallet.revenue.paying'),
                    value: String(data.revenue.payingCompanies),
                  },
                  { label: t('s14Wallet.revenue.arpu'), value: data.revenue.arpu },
                  {
                    label: t('s14Wallet.revenue.churn'),
                    value:
                      data.revenue.churnPercent === null ? none : `${data.revenue.churnPercent}%`,
                  },
                  { label: t('s14Wallet.revenue.ltv'), value: data.revenue.lifetimeValue ?? none },
                  {
                    label: t('s14Wallet.revenue.nrr'),
                    value: data.revenue.netRevenueRetention ?? none,
                  },
                  { label: t('s14Wallet.revenue.paid'), value: data.revenue.paidRevenue },
                ]}
              />
            </CardContent>
          </Card>
          <DataTable
            columns={pairColumns}
            rows={data.revenue.revenueByPlan.map((r) => ({
              id: r.plan,
              key: r.plan,
              amount: r.revenue,
            }))}
            getRowId={(r) => r.id}
            caption={t('s14Wallet.revenue.byPlan')}
            empty={<EmptyState title={t('s14Wallet.revenue.empty')} />}
          />
          <DataTable
            columns={pairColumns}
            rows={data.revenue.revenueByCountry.map((r) => ({
              id: r.country,
              key: r.country,
              amount: r.revenue,
            }))}
            getRowId={(r) => r.id}
            caption={t('s14Wallet.revenue.byCountry')}
            empty={<EmptyState title={t('s14Wallet.revenue.empty')} />}
          />
          <Card>
            <CardHeader>
              <CardTitle>{t('s14Wallet.revenue.cohorts')}</CardTitle>
            </CardHeader>
            <CardContent>
              {data.revenue.cohorts.length === 0 ? (
                <p>{t('s14Wallet.revenue.empty')}</p>
              ) : (
                <ul className="space-y-1">
                  {data.revenue.cohorts.map((c) => (
                    <li key={c.cohort}>
                      {c.cohort} ({c.size}): {c.retention.join(' / ')}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>{t('s14Wallet.revenue.flow')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-sp-12">
              <Stats
                items={[
                  {
                    label: `${t('s14Wallet.revenue.mor')}: ${t('s14Wallet.revenue.payments')}`,
                    value: String(data.flow.mor.payments),
                  },
                  {
                    label: `${t('s14Wallet.revenue.mor')}: ${t('s14Wallet.revenue.gross')}`,
                    value: data.flow.mor.gross,
                  },
                  {
                    label: `${t('s14Wallet.revenue.mor')}: ${t('s14Wallet.revenue.fees')}`,
                    value: data.flow.mor.fees,
                  },
                  {
                    label: `${t('s14Wallet.revenue.direct')}: ${t('s14Wallet.revenue.payments')}`,
                    value: String(data.flow.direct.payments),
                  },
                  {
                    label: `${t('s14Wallet.revenue.direct')}: ${t('s14Wallet.revenue.gross')}`,
                    value: data.flow.direct.gross,
                  },
                  { label: t('s14Wallet.revenue.chargedBack'), value: data.flow.chargedBack },
                  { label: t('s14Wallet.revenue.payoutFees'), value: data.flow.payoutFees },
                  {
                    label: t('s14Wallet.revenue.failureRate'),
                    value:
                      data.flow.payoutFailureRate === null
                        ? none
                        : `${data.flow.payoutFailureRate}%`,
                  },
                ]}
              />
              <DataTable
                columns={pairColumns}
                rows={data.flow.payouts.map((p) => ({
                  id: p.status,
                  key: `${p.status} (${p.count})`,
                  amount: p.amount,
                }))}
                getRowId={(r) => r.id}
                caption={t('s14Wallet.revenue.payouts')}
                empty={<EmptyState title={t('s14Wallet.revenue.empty')} />}
              />
            </CardContent>
          </Card>
          <DataTable
            columns={healthColumns}
            rows={data.health}
            getRowId={(r) => r.companyId}
            caption={t('s14Wallet.revenue.health')}
            empty={<EmptyState title={t('s14Wallet.revenue.empty')} />}
          />
        </>
      )}
    </div>
  );
}
