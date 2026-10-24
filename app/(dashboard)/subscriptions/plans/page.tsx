// path: app/(dashboard)/subscriptions/plans/page.tsx
import type { Metadata } from 'next';
import { ActionButton } from '@/app/(dashboard)/wallet/_components/action-button';
import { JsonForm } from '@/app/(dashboard)/wallet/_components/json-form';
import { DataTable, type DataColumn } from '@/components/shared/data-table';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState, ErrorState } from '@/components/shared/state-views';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getService } from '@/lib/container';
import { t, type StringKey } from '@/lib/i18n';
import { requirePagePermission } from '@/services/base/page-guard';
import { listClientPlans, type ClientPlanView } from '@/services/subscription/client-plans';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Recurring plans' };

export default async function ClientPlansPage(): Promise<JSX.Element> {
  const actor = await requirePagePermission(
    'client_subscription.read',
    'tenant',
    'client_subscription_plan',
  );
  const companyId = actor.companyId as string;
  const canManage = await getService('permissions').can(actor, 'client_subscription.manage', {
    type: 'client_subscription_plan',
  });
  let rows: ClientPlanView[] | null;
  try {
    rows = await listClientPlans(companyId, true);
  } catch {
    rows = null;
  }
  const columns: readonly DataColumn<ClientPlanView>[] = [
    {
      key: 'name',
      header: t('s14Wallet.clientSubs.planColumns.name'),
      primary: true,
      cell: (r) => r.name,
    },
    { key: 'price', header: t('s14Wallet.clientSubs.planColumns.price'), cell: (r) => r.price },
    {
      key: 'interval',
      header: t('s14Wallet.clientSubs.planColumns.interval'),
      hideOnMobile: true,
      cell: (r) => t(`s14Wallet.clientSubs.interval.${r.interval}` as StringKey),
    },
    {
      key: 'trial',
      header: t('s14Wallet.clientSubs.planColumns.trial'),
      hideOnMobile: true,
      cell: (r) => String(r.trialDays),
    },
    {
      key: 'status',
      header: t('s14Wallet.clientSubs.planColumns.status'),
      cell: (r) => (
        <span className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">
            {t(`s14Wallet.clientSubs.planStatuses.${r.status}` as StringKey)}
          </Badge>
          {canManage && r.status === 'active' ? (
            <ActionButton
              endpoint={`/api/subscriptions/client/plans/${r.id}/archive`}
              label={t('s14Wallet.clientSubs.archive')}
              doneText={t('s14Wallet.clientSubs.archived')}
            />
          ) : null}
        </span>
      ),
    },
  ];
  return (
    <div className="space-y-sp-24">
      <PageHeader
        title={t('s14Wallet.clientSubs.plansTitle')}
        description={t('s14Wallet.clientSubs.plansDescription')}
      />
      {rows === null ? (
        <ErrorState description={t('s14Wallet.common.loadError')} />
      ) : (
        <DataTable
          columns={columns}
          rows={rows}
          getRowId={(r) => r.id}
          caption={t('s14Wallet.clientSubs.plansTitle')}
          empty={<EmptyState title={t('s14Wallet.clientSubs.noPlans')} />}
        />
      )}
      {canManage ? (
        <Card>
          <CardHeader>
            <CardTitle>{t('s14Wallet.clientSubs.createPlanTitle')}</CardTitle>
          </CardHeader>
          <CardContent>
            <JsonForm
              endpoint="/api/subscriptions/client/plans"
              resetAfter
              submitLabel={t('s14Wallet.clientSubs.createPlan')}
              doneText={t('s14Wallet.clientSubs.planCreated')}
              fields={[
                { name: 'name', label: t('s14Wallet.clientSubs.planName'), required: true },
                { name: 'description', label: t('s14Wallet.clientSubs.planDescription') },
                { name: 'price', label: t('s14Wallet.clientSubs.planPrice'), required: true },
                {
                  name: 'interval',
                  label: t('s14Wallet.clientSubs.planInterval'),
                  kind: 'select',
                  initial: 'month',
                  options: [
                    { value: 'month', label: t('s14Wallet.clientSubs.monthly') },
                    { value: 'year', label: t('s14Wallet.clientSubs.yearly') },
                  ],
                },
                {
                  name: 'trialDays',
                  label: t('s14Wallet.clientSubs.planTrial'),
                  initial: '0',
                  whole: true,
                },
                { name: 'seatPrice', label: t('s14Wallet.clientSubs.planSeatPrice'), initial: '0' },
                {
                  name: 'includedSeats',
                  label: t('s14Wallet.clientSubs.planIncluded'),
                  initial: '1',
                  whole: true,
                },
                { name: 'features', label: t('s14Wallet.clientSubs.planFeatures'), list: true },
              ]}
            />
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
