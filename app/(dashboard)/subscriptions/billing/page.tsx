// path: app/(dashboard)/subscriptions/billing/page.tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import { ActionButton } from '@/app/(dashboard)/wallet/_components/action-button';
import { JsonForm } from '@/app/(dashboard)/wallet/_components/json-form';
import { DataTable, type DataColumn } from '@/components/shared/data-table';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState, ErrorState } from '@/components/shared/state-views';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getService } from '@/lib/container';
import { t, type StringKey } from '@/lib/i18n';
import { requirePagePermission } from '@/services/base/page-guard';
import { entitlementsOf } from '@/services/entitlement/entitlement';
import { meters, type MeterView } from '@/services/entitlement/usage';
import { listPlans, type PlanView } from '@/services/plan/plans';
import { listInvoices, type PlatformInvoiceView } from '@/services/subscription/invoices';
import { getSubscription, type SubscriptionView } from '@/services/subscription/platform';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Plan and billing' };

const day = (iso: string): string => iso.slice(0, 10);

export default async function BillingPage(): Promise<JSX.Element> {
  const actor = await requirePagePermission('subscription.read', 'tenant', 'subscription');
  const companyId = actor.companyId as string;
  const canManage = await getService('permissions').can(actor, 'subscription.manage', {
    type: 'subscription',
  });
  let sub: SubscriptionView | null = null;
  let invoices: PlatformInvoiceView[] = [];
  let usage: MeterView[] = [];
  let plans: PlanView[] = [];
  let planSlug = 'free';
  let failed = false;
  try {
    [sub, invoices, usage, plans, planSlug] = await Promise.all([
      getSubscription(companyId),
      listInvoices(companyId),
      meters(companyId),
      listPlans(),
      entitlementsOf(companyId).then((e) => e.slug),
    ]);
  } catch {
    failed = true;
  }
  const choosable = plans.filter(
    (p) => p.visible || p.slug === sub?.planSlug || p.slug === planSlug,
  );
  const active = sub !== null && ['trialing', 'active', 'past_due', 'grace'].includes(sub.status);
  const pendingName = sub?.pendingPlanSlug
    ? (plans.find((p) => p.slug === sub?.pendingPlanSlug)?.name ?? sub.pendingPlanSlug)
    : null;
  const columns: readonly DataColumn<PlatformInvoiceView>[] = [
    {
      key: 'number',
      header: t('s14Wallet.billing.invoiceColumns.number'),
      primary: true,
      cell: (r) => (
        <Link className="underline" href={`/subscriptions/billing/invoices/${r.id}`}>
          {r.number}
        </Link>
      ),
    },
    {
      key: 'date',
      header: t('s14Wallet.billing.invoiceColumns.date'),
      hideOnMobile: true,
      cell: (r) => day(r.issuedAt),
    },
    { key: 'total', header: t('s14Wallet.billing.invoiceColumns.total'), cell: (r) => r.total },
    {
      key: 'status',
      header: t('s14Wallet.billing.invoiceColumns.status'),
      cell: (r) => (
        <Badge variant="outline">
          {t(`s14Wallet.billing.invoiceStatuses.${r.status}` as StringKey)}
        </Badge>
      ),
    },
    {
      key: 'due',
      header: t('s14Wallet.billing.invoiceColumns.due'),
      hideOnMobile: true,
      cell: (r) => day(r.dueAt),
    },
  ];
  return (
    <div className="space-y-sp-24">
      <PageHeader
        title={t('s14Wallet.billing.pageTitle')}
        description={t('s14Wallet.billing.pageDescription')}
      />
      {failed ? (
        <ErrorState description={t('s14Wallet.common.loadError')} />
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle>{t('s14Wallet.billing.currentPlan')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-sp-8">
              <p className="text-h3 font-semibold">
                {plans.find((p) => p.slug === planSlug)?.name ?? planSlug}
              </p>
              {sub && sub.status !== 'ended' ? (
                <>
                  <p>
                    <Badge variant="outline">
                      {t(`s14Wallet.billing.statuses.${sub.status}` as StringKey)}
                    </Badge>{' '}
                    {t(`s14Wallet.billing.interval.${sub.interval}` as StringKey)}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {sub.status === 'trialing' && sub.trialEndsAt
                      ? t('s14Wallet.billing.trialEnds', { date: day(sub.trialEndsAt) })
                      : sub.cancelAtPeriodEnd
                        ? t('s14Wallet.billing.cancelsOn', { date: day(sub.currentPeriodEnd) })
                        : t('s14Wallet.billing.renews', { date: day(sub.currentPeriodEnd) })}
                  </p>
                  {pendingName && sub.pendingKind === 'period_end' ? (
                    <p className="text-sm">
                      {t('s14Wallet.billing.pendingChange', {
                        plan: pendingName,
                        date: day(sub.currentPeriodEnd),
                      })}
                    </p>
                  ) : null}
                </>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {t('s14Wallet.billing.noSubscription', { plan: planSlug })}
                </p>
              )}
              {sub && sub.cancelAtPeriodEnd && canManage ? (
                <ActionButton
                  endpoint="/api/subscriptions/reactivate"
                  label={t('s14Wallet.billing.reactivate')}
                  doneText={t('s14Wallet.billing.reactivated')}
                />
              ) : null}
              <Alert>{t('s14Wallet.billing.freeNote')}</Alert>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>{t('s14Wallet.billing.usageTitle')}</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-sp-8">
                {usage.map((m) => (
                  <li key={m.key}>
                    <div className="flex justify-between text-sm">
                      <span>{t(`s14Wallet.billing.meters.${m.key}` as StringKey)}</span>
                      <span>
                        {m.used} /{' '}
                        {m.limit === null ? t('s14Wallet.billing.usageUnlimited') : m.limit} -{' '}
                        {t(`s14Wallet.billing.meterStates.${m.state}` as StringKey)}
                      </span>
                    </div>
                    <div
                      className="h-2 rounded bg-muted"
                      role="progressbar"
                      aria-valuenow={m.percent}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-label={t(`s14Wallet.billing.meters.${m.key}` as StringKey)}
                    >
                      <div
                        className={
                          m.state === 'blocked'
                            ? 'h-2 rounded bg-destructive'
                            : m.state === 'warning'
                              ? 'h-2 rounded bg-amber-500'
                              : 'h-2 rounded bg-primary'
                        }
                        style={{ width: `${m.percent}%` }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
          {canManage ? (
            <Card>
              <CardHeader>
                <CardTitle>{t('s14Wallet.billing.choosePlanTitle')}</CardTitle>
                <ul className="text-sm text-muted-foreground">
                  {choosable.map((p) => (
                    <li key={p.slug}>
                      {p.name}:{' '}
                      {t('s14Wallet.billing.pricesLine', {
                        monthly: p.priceMonthly,
                        yearly: p.priceYearly,
                      })}
                      {p.trialDays > 0
                        ? `, ${t('s14Wallet.billing.trialLine', { days: p.trialDays })}`
                        : ''}
                      {p.badge ? ` (${p.badge})` : ''}
                    </li>
                  ))}
                </ul>
              </CardHeader>
              <CardContent>
                <JsonForm
                  endpoint={active ? '/api/subscriptions/change' : '/api/subscriptions/subscribe'}
                  idempotent
                  submitLabel={
                    active ? t('s14Wallet.billing.change') : t('s14Wallet.billing.subscribe')
                  }
                  doneText={t('s14Wallet.billing.done')}
                  fields={[
                    {
                      name: 'planSlug',
                      label: t('s14Wallet.billing.plan'),
                      kind: 'select',
                      initial: choosable[0]?.slug ?? 'free',
                      options: choosable.map((p) => ({ value: p.slug, label: p.name })),
                    },
                    {
                      name: 'interval',
                      label: t('s14Wallet.billing.intervalLabel'),
                      kind: 'select',
                      initial: sub?.interval ?? 'month',
                      options: [
                        { value: 'month', label: t('s14Wallet.billing.monthly') },
                        { value: 'year', label: t('s14Wallet.billing.yearly') },
                      ],
                    },
                  ]}
                />
              </CardContent>
            </Card>
          ) : null}
          <section className="space-y-sp-8">
            <h2 className="text-h3 font-semibold">{t('s14Wallet.billing.invoicesTitle')}</h2>
            <DataTable
              columns={columns}
              rows={invoices}
              getRowId={(r) => r.id}
              caption={t('s14Wallet.billing.invoicesTitle')}
              empty={<EmptyState title={t('s14Wallet.billing.invoicesEmpty')} />}
            />
          </section>
          {canManage && sub && active && !sub.cancelAtPeriodEnd ? (
            <Card>
              <CardHeader>
                <CardTitle>{t('s14Wallet.billing.cancelTitle')}</CardTitle>
              </CardHeader>
              <CardContent>
                <JsonForm
                  endpoint="/api/subscriptions/cancel"
                  submitLabel={t('s14Wallet.billing.cancel')}
                  doneText={t('s14Wallet.billing.cancelled')}
                  fields={[
                    { name: 'reason', label: t('s14Wallet.billing.cancelReason'), required: true },
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
