// path: app/(dashboard)/wallet/payouts/page.tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import { DataTable, type DataColumn } from '@/components/shared/data-table';
import { PageHeader } from '@/components/shared/page-header';
import { Alert } from '@/components/ui/alert';
import { EmptyState, ErrorState } from '@/components/shared/state-views';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getService } from '@/lib/container';
import { t, type StringKey } from '@/lib/i18n';
import { requirePagePermission } from '@/services/base/page-guard';
import { listMethods, type MethodView } from '@/services/payout/methods';
import { listPayouts, type PayoutView } from '@/services/payout/payouts';
import { getSchedule, type ScheduleView } from '@/services/payout/schedule';
import { loadPayoutRules } from '@/services/payout/settings';
import type { PayoutRules } from '@/lib/payment/payout';
import { ActionButton } from '../_components/action-button';
import { JsonForm } from '../_components/json-form';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Payouts' };

const CANCELLABLE = ['requested', 'pending_approval', 'approved'];

export default async function PayoutsPage(): Promise<JSX.Element> {
  const actor = await requirePagePermission('wallet.read', 'tenant', 'payout');
  const companyId = actor.companyId as string;
  const permissions = getService('permissions');
  const canRequest = await permissions.can(actor, 'payout.request', { type: 'payout' });
  const canManage = await permissions.can(actor, 'payout.method.manage', {
    type: 'payout_schedule',
  });
  let rows: PayoutView[] | null;
  let methods: MethodView[] = [];
  let schedule: ScheduleView | null = null;
  let rules: PayoutRules | null = null;
  try {
    [rows, methods, schedule, rules] = await Promise.all([
      listPayouts(companyId),
      listMethods(companyId),
      getSchedule(companyId),
      loadPayoutRules(companyId),
    ]);
  } catch {
    rows = null;
  }
  const names = new Map(methods.map((m) => [m.id, `${m.label} (${m.hint})`]));
  const active = methods.filter((m) => m.status === 'active');
  const columns: readonly DataColumn<PayoutView>[] = [
    {
      key: 'date',
      header: t('s14Wallet.payouts.columns.date'),
      primary: true,
      cell: (r) => r.createdAt.slice(0, 10),
    },
    {
      key: 'amount',
      header: t('s14Wallet.payouts.columns.amount'),
      cell: (r) => `USD ${r.amount}`,
    },
    {
      key: 'fee',
      header: t('s14Wallet.payouts.columns.fee'),
      hideOnMobile: true,
      cell: (r) => `USD ${r.fee}`,
    },
    {
      key: 'net',
      header: t('s14Wallet.payouts.columns.net'),
      cell: (r) =>
        r.localAmount && r.fxRate
          ? t('s14Wallet.payouts.local', {
              amount: r.localAmount,
              currency: r.currency,
              rate: r.fxRate,
            })
          : `USD ${r.net}`,
    },
    {
      key: 'method',
      header: t('s14Wallet.payouts.columns.method'),
      hideOnMobile: true,
      cell: (r) => names.get(r.methodId) ?? '',
    },
    {
      key: 'status',
      header: t('s14Wallet.payouts.columns.status'),
      cell: (r) => (
        <span className="flex flex-col gap-1">
          <Badge variant="outline">
            {t(`s14Wallet.payouts.statuses.${r.status}` as StringKey)}
          </Badge>
          {r.failureReason && r.status !== 'paid' ? (
            <span className="text-sm text-muted-foreground">{r.failureReason}</span>
          ) : null}
          {r.nextAttemptAt && r.status === 'approved' ? (
            <span className="text-sm text-muted-foreground">
              {r.nextAttemptAt.slice(0, 16).replace('T', ' ')} UTC
            </span>
          ) : null}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      cell: (r) =>
        CANCELLABLE.includes(r.status) ? (
          <ActionButton
            endpoint={`/api/payouts/${r.id}/cancel`}
            label={t('s14Wallet.payouts.cancel')}
            doneText={t('s14Wallet.payouts.cancelled')}
          />
        ) : null,
    },
  ];
  return (
    <div className="space-y-sp-24">
      <PageHeader
        title={t('s14Wallet.payouts.pageTitle')}
        description={t('s14Wallet.payouts.pageDescription')}
        actions={
          <Button asChild variant="outline">
            <Link href="/wallet/methods">{t('s14Wallet.wallet.methodsLink')}</Link>
          </Button>
        }
      />
      {rows === null ? (
        <ErrorState description={t('s14Wallet.common.loadError')} />
      ) : (
        <>
          {canRequest ? (
            <Card>
              <CardHeader>
                <CardTitle>{t('s14Wallet.payouts.requestTitle')}</CardTitle>
                {rules ? (
                  <p className="text-sm text-muted-foreground">
                    {t('s14Wallet.payouts.rules', {
                      min: rules.minAmount,
                      limit: rules.periodLimit,
                      unit: rules.periodUnit,
                      large: rules.largeThreshold,
                    })}
                  </p>
                ) : null}
              </CardHeader>
              <CardContent>
                {active.length === 0 ? (
                  <Alert>{t('s14Wallet.payouts.noMethod')}</Alert>
                ) : (
                  <JsonForm
                    endpoint="/api/payouts"
                    idempotent
                    resetAfter
                    submitLabel={t('s14Wallet.payouts.request')}
                    doneText={t('s14Wallet.payouts.requested')}
                    fields={[
                      { name: 'amount', label: t('s14Wallet.payouts.amount'), required: true },
                      {
                        name: 'methodId',
                        label: t('s14Wallet.payouts.method'),
                        kind: 'select',
                        initial: (active.find((m) => m.isDefault) ?? active[0])?.id ?? '',
                        options: active.map((m) => ({
                          value: m.id,
                          label: `${m.label} (${m.hint})`,
                        })),
                      },
                      { name: 'note', label: t('s14Wallet.payouts.note') },
                    ]}
                  />
                )}
              </CardContent>
            </Card>
          ) : null}
          <section className="space-y-sp-8">
            <h2 className="text-h3 font-semibold">{t('s14Wallet.payouts.historyTitle')}</h2>
            <DataTable
              columns={columns}
              rows={rows}
              getRowId={(r) => r.id}
              caption={t('s14Wallet.payouts.historyTitle')}
              empty={<EmptyState title={t('s14Wallet.payouts.historyEmpty')} />}
            />
          </section>
          <Card>
            <CardHeader>
              <CardTitle>{t('s14Wallet.payouts.scheduleTitle')}</CardTitle>
              <p className="text-sm text-muted-foreground">
                {t('s14Wallet.payouts.scheduleDescription')}
              </p>
              <p className="text-sm">
                {schedule && schedule.enabled
                  ? t('s14Wallet.payouts.nextRun', {
                      when: `${schedule.nextRunAt.slice(0, 16).replace('T', ' ')} UTC`,
                    })
                  : t('s14Wallet.payouts.scheduleOff')}
              </p>
            </CardHeader>
            {canManage && active.length > 0 ? (
              <CardContent className="space-y-sp-12">
                <JsonForm
                  endpoint="/api/payouts/schedule"
                  method="PUT"
                  submitLabel={t('s14Wallet.common.save')}
                  doneText={t('s14Wallet.payouts.scheduleSaved')}
                  fields={[
                    {
                      name: 'methodId',
                      label: t('s14Wallet.payouts.method'),
                      kind: 'select',
                      initial:
                        schedule?.methodId ??
                        (active.find((m) => m.isDefault) ?? active[0])?.id ??
                        '',
                      options: active.map((m) => ({
                        value: m.id,
                        label: `${m.label} (${m.hint})`,
                      })),
                    },
                    {
                      name: 'frequency',
                      label: t('s14Wallet.payouts.frequency'),
                      kind: 'select',
                      initial: schedule?.frequency ?? 'weekly',
                      options: (['daily', 'weekly', 'monthly'] as const).map((f) => ({
                        value: f,
                        label: t(`s14Wallet.payouts.frequencies.${f}` as StringKey),
                      })),
                    },
                    {
                      name: 'weekday',
                      label: t('s14Wallet.payouts.weekday'),
                      kind: 'select',
                      initial: String(schedule?.weekday ?? 1),
                      whole: true,
                      options: (['0', '1', '2', '3', '4', '5', '6'] as const).map((d) => ({
                        value: d,
                        label: t(`s14Wallet.payouts.weekdays.${d}` as StringKey),
                      })),
                    },
                    {
                      name: 'monthDay',
                      label: t('s14Wallet.payouts.monthDay'),
                      initial: String(schedule?.monthDay ?? ''),
                      whole: true,
                    },
                    {
                      name: 'keepAmount',
                      label: t('s14Wallet.payouts.keep'),
                      initial: schedule?.keepAmount ?? '0',
                    },
                    {
                      name: 'enabled',
                      label: t('s14Wallet.payouts.enabled'),
                      kind: 'checkbox',
                      initial: schedule?.enabled === false ? 'false' : 'true',
                    },
                  ]}
                />
                {schedule ? (
                  <ActionButton
                    endpoint="/api/payouts/schedule"
                    method="DELETE"
                    variant="destructive"
                    label={t('s14Wallet.payouts.removeSchedule')}
                    doneText={t('s14Wallet.common.saved')}
                  />
                ) : null}
              </CardContent>
            ) : null}
          </Card>
        </>
      )}
    </div>
  );
}
