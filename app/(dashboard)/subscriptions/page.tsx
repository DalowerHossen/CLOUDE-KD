// path: app/(dashboard)/subscriptions/page.tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import { JsonForm } from '@/app/(dashboard)/wallet/_components/json-form';
import { DataTable, type DataColumn } from '@/components/shared/data-table';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState, ErrorState } from '@/components/shared/state-views';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getService } from '@/lib/container';
import { t, type StringKey } from '@/lib/i18n';
import { requirePagePermission } from '@/services/base/page-guard';
import { recentClients } from '@/services/client/clients';
import {
  clientSubscriptionReport,
  type ClientSubscriptionReport,
} from '@/services/subscription/client-reports';
import { listClientPlans, type ClientPlanView } from '@/services/subscription/client-plans';
import { listClientSubs, type ClientSubView } from '@/services/subscription/client-store';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Client subscriptions' };

type Row = ClientSubView & { clientName: string; planName: string };

const DAY = 86_400_000;

const columns: readonly DataColumn<Row>[] = [
  {
    key: 'client',
    header: t('s14Wallet.clientSubs.columns.client'),
    primary: true,
    cell: (r) => (
      <Link className="underline" href={`/subscriptions/${r.id}`}>
        {r.clientName}
      </Link>
    ),
  },
  {
    key: 'plan',
    header: t('s14Wallet.clientSubs.columns.plan'),
    hideOnMobile: true,
    cell: (r) => `${r.planName} (${t(`s14Wallet.clientSubs.interval.${r.interval}` as StringKey)})`,
  },
  {
    key: 'status',
    header: t('s14Wallet.clientSubs.columns.status'),
    cell: (r) => (
      <Badge variant="outline">{t(`s14Wallet.clientSubs.statuses.${r.status}` as StringKey)}</Badge>
    ),
  },
  { key: 'amount', header: t('s14Wallet.clientSubs.columns.amount'), cell: (r) => r.cycleAmount },
  {
    key: 'next',
    header: t('s14Wallet.clientSubs.columns.next'),
    hideOnMobile: true,
    cell: (r) => (r.nextBillingAt ? r.nextBillingAt.slice(0, 10) : ''),
  },
];

export default async function ClientSubscriptionsPage(): Promise<JSX.Element> {
  const actor = await requirePagePermission(
    'client_subscription.read',
    'tenant',
    'client_subscription',
  );
  const companyId = actor.companyId as string;
  const canManage = await getService('permissions').can(actor, 'client_subscription.manage', {
    type: 'client_subscription',
  });
  const today = new Date();
  const from = new Date(today.getTime() - 30 * DAY).toISOString().slice(0, 10);
  const to = new Date(today.getTime() + DAY).toISOString().slice(0, 10);
  let rows: Row[] | null;
  let report: ClientSubscriptionReport | null = null;
  let plans: ClientPlanView[] = [];
  let clients: { id: string; name: string }[] = [];
  try {
    [rows, report, plans, clients] = await Promise.all([
      listClientSubs(companyId),
      clientSubscriptionReport(companyId, from, to),
      listClientPlans(companyId),
      recentClients(companyId, 'active').then((list) =>
        list.map((c) => ({ id: c.id, name: c.name })),
      ),
    ]);
  } catch {
    rows = null;
  }
  return (
    <div className="space-y-sp-24">
      <PageHeader
        title={t('s14Wallet.clientSubs.pageTitle')}
        description={t('s14Wallet.clientSubs.pageDescription')}
        actions={
          <>
            <Button asChild variant="outline">
              <Link href="/subscriptions/plans">{t('s14Wallet.clientSubs.plansLink')}</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/subscriptions/billing">{t('s14Wallet.nav.billing')}</Link>
            </Button>
          </>
        }
      />
      {rows === null ? (
        <ErrorState description={t('s14Wallet.common.loadError')} />
      ) : (
        <>
          {report ? (
            <Card>
              <CardHeader>
                <CardTitle>{t('s14Wallet.clientSubs.reportTitle')}</CardTitle>
              </CardHeader>
              <CardContent>
                <dl className="grid gap-sp-12 sm:grid-cols-3 lg:grid-cols-6">
                  <div>
                    <dt className="text-muted-foreground">{t('s14Wallet.clientSubs.mrr')}</dt>
                    <dd className="font-semibold">{report.mrr}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">{t('s14Wallet.clientSubs.arr')}</dt>
                    <dd className="font-semibold">{report.arr}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">
                      {t('s14Wallet.clientSubs.subscribers')}
                    </dt>
                    <dd className="font-semibold">{report.subscribers}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">{t('s14Wallet.clientSubs.arpu')}</dt>
                    <dd className="font-semibold">{report.arpu}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">{t('s14Wallet.clientSubs.churn')}</dt>
                    <dd className="font-semibold">
                      {report.churnPercent === null
                        ? t('s14Wallet.clientSubs.noChurn')
                        : `${report.churnPercent}%`}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">{t('s14Wallet.clientSubs.ltv')}</dt>
                    <dd className="font-semibold">
                      {report.lifetimeValue ?? t('s14Wallet.clientSubs.noChurn')}
                    </dd>
                  </div>
                </dl>
              </CardContent>
            </Card>
          ) : null}
          <DataTable
            columns={columns}
            rows={rows}
            getRowId={(r) => r.id}
            caption={t('s14Wallet.clientSubs.pageTitle')}
            empty={<EmptyState title={t('s14Wallet.clientSubs.empty')} />}
          />
          {canManage ? (
            <Card>
              <CardHeader>
                <CardTitle>{t('s14Wallet.clientSubs.startTitle')}</CardTitle>
              </CardHeader>
              <CardContent>
                {plans.length === 0 ? (
                  <Alert>{t('s14Wallet.clientSubs.noPlans')}</Alert>
                ) : clients.length === 0 ? (
                  <Alert>{t('s14Wallet.clientSubs.noClients')}</Alert>
                ) : (
                  <JsonForm
                    endpoint="/api/subscriptions/client"
                    resetAfter
                    submitLabel={t('s14Wallet.clientSubs.start')}
                    doneText={t('s14Wallet.clientSubs.started')}
                    fields={[
                      {
                        name: 'clientId',
                        label: t('s14Wallet.clientSubs.client'),
                        kind: 'select',
                        initial: clients[0]?.id ?? '',
                        options: clients.map((c) => ({ value: c.id, label: c.name })),
                      },
                      {
                        name: 'planId',
                        label: t('s14Wallet.clientSubs.plan'),
                        kind: 'select',
                        initial: plans[0]?.id ?? '',
                        options: plans.map((p) => ({
                          value: p.id,
                          label: `${p.name} - ${p.price} USD`,
                        })),
                      },
                      {
                        name: 'seats',
                        label: t('s14Wallet.clientSubs.seats'),
                        initial: '1',
                        whole: true,
                      },
                    ]}
                  />
                )}
              </CardContent>
            </Card>
          ) : null}
        </>
      )}
    </div>
  );
}
