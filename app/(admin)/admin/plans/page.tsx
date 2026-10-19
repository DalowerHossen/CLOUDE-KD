// path: app/(admin)/admin/plans/page.tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { JsonForm } from '@/app/(dashboard)/wallet/_components/json-form';
import { DataTable, type DataColumn } from '@/components/shared/data-table';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState, ErrorState } from '@/components/shared/state-views';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getService } from '@/lib/container';
import { t, type StringKey } from '@/lib/i18n';
import { listPlans, type PlanView } from '@/services/plan/plans';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Plans' };

const columns: readonly DataColumn<PlanView>[] = [
  {
    key: 'name',
    header: t('s14Wallet.plans.columns.name'),
    primary: true,
    cell: (r) => (
      <Link className="underline" href={`/admin/plans/${r.id}`}>
        {r.name}
      </Link>
    ),
  },
  {
    key: 'slug',
    header: t('s14Wallet.plans.columns.slug'),
    hideOnMobile: true,
    cell: (r) => r.slug,
  },
  { key: 'monthly', header: t('s14Wallet.plans.columns.monthly'), cell: (r) => r.priceMonthly },
  {
    key: 'yearly',
    header: t('s14Wallet.plans.columns.yearly'),
    hideOnMobile: true,
    cell: (r) => r.priceYearly,
  },
  {
    key: 'trial',
    header: t('s14Wallet.plans.columns.trial'),
    hideOnMobile: true,
    cell: (r) => String(r.trialDays),
  },
  {
    key: 'status',
    header: t('s14Wallet.plans.columns.status'),
    cell: (r) => (
      <span className="flex flex-col gap-1">
        <Badge variant="outline">{t(`s14Wallet.plans.statuses.${r.status}` as StringKey)}</Badge>
        <span className="text-sm text-muted-foreground">
          {r.visible ? t('s14Wallet.plans.visibleYes') : t('s14Wallet.plans.visibleNo')}
        </span>
      </span>
    ),
  },
  {
    key: 'order',
    header: t('s14Wallet.plans.columns.order'),
    hideOnMobile: true,
    cell: (r) => String(r.sortOrder),
  },
];

export default async function AdminPlansPage(): Promise<JSX.Element> {
  const actor = await getService('auth').getActor();
  if (!actor || actor.role !== 'super_admin') notFound();
  let rows: PlanView[] | null;
  try {
    rows = await listPlans({ includeArchived: true });
  } catch {
    rows = null;
  }
  return (
    <div className="space-y-sp-24">
      <PageHeader
        title={t('s14Wallet.plans.pageTitle')}
        description={t('s14Wallet.plans.pageDescription')}
      />
      {rows === null ? (
        <ErrorState description={t('s14Wallet.common.loadError')} />
      ) : (
        <DataTable
          columns={columns}
          rows={rows}
          getRowId={(r) => r.id}
          caption={t('s14Wallet.plans.pageTitle')}
          empty={<EmptyState title={t('s14Wallet.plans.pageTitle')} />}
        />
      )}
      <Card>
        <CardHeader>
          <CardTitle>{t('s14Wallet.plans.createTitle')}</CardTitle>
        </CardHeader>
        <CardContent>
          <JsonForm
            endpoint="/api/plans/manage"
            resetAfter
            submitLabel={t('s14Wallet.plans.create')}
            doneText={t('s14Wallet.plans.created')}
            fields={[
              { name: 'slug', label: t('s14Wallet.plans.slug'), required: true },
              { name: 'name', label: t('s14Wallet.plans.name'), required: true },
              { name: 'description', label: t('s14Wallet.plans.description') },
              { name: 'priceMonthly', label: t('s14Wallet.plans.priceMonthly'), initial: '0' },
              { name: 'priceYearly', label: t('s14Wallet.plans.priceYearly'), initial: '0' },
              { name: 'seatPriceMonthly', label: t('s14Wallet.plans.seatPrice'), initial: '0' },
              {
                name: 'trialDays',
                label: t('s14Wallet.plans.trialDays'),
                initial: '0',
                whole: true,
              },
              {
                name: 'sortOrder',
                label: t('s14Wallet.plans.sortOrder'),
                initial: '100',
                whole: true,
              },
              { name: 'badge', label: t('s14Wallet.plans.badge') },
              { name: 'visible', label: t('s14Wallet.plans.visible'), kind: 'checkbox' },
            ]}
          />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{t('s14Wallet.plans.migrateTitle')}</CardTitle>
          <p className="text-sm text-muted-foreground">{t('s14Wallet.plans.migrateDescription')}</p>
        </CardHeader>
        <CardContent>
          <JsonForm
            endpoint="/api/plans/migrate"
            submitLabel={t('s14Wallet.plans.migrate')}
            doneText={t('s14Wallet.plans.migrateDone')}
            fields={[
              { name: 'fromSlug', label: t('s14Wallet.plans.fromSlug'), required: true },
              { name: 'toSlug', label: t('s14Wallet.plans.toSlug'), required: true },
              {
                name: 'dryRun',
                label: t('s14Wallet.plans.dryRun'),
                kind: 'checkbox',
                initial: 'true',
              },
            ]}
          />
        </CardContent>
      </Card>
    </div>
  );
}
