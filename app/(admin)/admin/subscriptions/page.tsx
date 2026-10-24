// path: app/(admin)/admin/subscriptions/page.tsx
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { JsonForm } from '@/app/(dashboard)/wallet/_components/json-form';
import { DataTable, type DataColumn } from '@/components/shared/data-table';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState, ErrorState } from '@/components/shared/state-views';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getService } from '@/lib/container';
import { t, type StringKey } from '@/lib/i18n';
import { listAllInvoices, type PlatformInvoiceView } from '@/services/subscription/invoices';
import { listSubscriptions, type SubscriptionView } from '@/services/subscription/platform';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Subscriptions' };

type SubRow = SubscriptionView & { companyName: string };

const columns: readonly DataColumn<SubRow>[] = [
  {
    key: 'company',
    header: t('s14Wallet.adminSubs.columns.company'),
    primary: true,
    cell: (r) => r.companyName,
  },
  {
    key: 'plan',
    header: t('s14Wallet.adminSubs.columns.plan'),
    cell: (r) => `${r.planSlug} (${r.interval})`,
  },
  {
    key: 'status',
    header: t('s14Wallet.adminSubs.columns.status'),
    cell: (r) => (
      <Badge variant="outline">{t(`s14Wallet.billing.statuses.${r.status}` as StringKey)}</Badge>
    ),
  },
  {
    key: 'ends',
    header: t('s14Wallet.adminSubs.columns.ends'),
    hideOnMobile: true,
    cell: (r) => r.currentPeriodEnd.slice(0, 10),
  },
  {
    key: 'attempts',
    header: t('s14Wallet.adminSubs.columns.attempts'),
    hideOnMobile: true,
    cell: (r) => String(r.dunningAttempts),
  },
];

const invoiceColumns: readonly DataColumn<PlatformInvoiceView>[] = [
  {
    key: 'number',
    header: t('s14Wallet.adminSubs.invoiceColumns.number'),
    primary: true,
    cell: (r) => r.number,
  },
  {
    key: 'company',
    header: t('s14Wallet.adminSubs.invoiceColumns.company'),
    hideOnMobile: true,
    cell: (r) => r.buyerName,
  },
  { key: 'total', header: t('s14Wallet.adminSubs.invoiceColumns.total'), cell: (r) => r.total },
  {
    key: 'due',
    header: t('s14Wallet.adminSubs.invoiceColumns.due'),
    hideOnMobile: true,
    cell: (r) => r.dueAt.slice(0, 10),
  },
  {
    key: 'pay',
    header: '',
    cell: (r) => (
      <JsonForm
        endpoint={`/api/subscriptions/invoices/${r.id}/pay`}
        submitLabel={t('s14Wallet.adminSubs.recordPayment')}
        doneText={t('s14Wallet.adminSubs.paid')}
        fields={[{ name: 'reference', label: t('s14Wallet.adminSubs.reference'), required: true }]}
      />
    ),
  },
];

export default async function AdminSubscriptionsPage({
  searchParams,
}: {
  searchParams: Promise<{ plan?: string; status?: string }>;
}): Promise<JSX.Element> {
  const actor = await getService('auth').getActor();
  if (!actor || !['super_admin', 'ceo', 'admin_staff'].includes(actor.role)) notFound();
  const q = await searchParams;
  let subs: SubRow[] | null;
  let open: PlatformInvoiceView[] = [];
  try {
    [subs, open] = await Promise.all([
      listSubscriptions(actor, { plan: q.plan, status: q.status }),
      listAllInvoices(actor, { status: 'open' }),
    ]);
  } catch {
    subs = null;
  }
  const isSuper = actor.role === 'super_admin';
  return (
    <div className="space-y-sp-24">
      <PageHeader
        title={t('s14Wallet.adminSubs.pageTitle')}
        description={t('s14Wallet.adminSubs.pageDescription')}
      />
      {subs === null ? (
        <ErrorState description={t('s14Wallet.common.loadError')} />
      ) : (
        <>
          <DataTable
            columns={columns}
            rows={subs}
            getRowId={(r) => r.id}
            caption={t('s14Wallet.adminSubs.pageTitle')}
            empty={<EmptyState title={t('s14Wallet.adminSubs.pageTitle')} />}
          />
          <section className="space-y-sp-8">
            <h2 className="text-h3 font-semibold">{t('s14Wallet.adminSubs.openInvoices')}</h2>
            <DataTable
              columns={isSuper ? invoiceColumns : invoiceColumns.slice(0, 4)}
              rows={open}
              getRowId={(r) => r.id}
              caption={t('s14Wallet.adminSubs.openInvoices')}
              empty={<EmptyState title={t('s14Wallet.billing.invoicesEmpty')} />}
            />
          </section>
          {isSuper ? (
            <>
              <Card>
                <CardHeader>
                  <CardTitle>{t('s14Wallet.adminSubs.setPlanTitle')}</CardTitle>
                </CardHeader>
                <CardContent>
                  <JsonForm
                    endpoint="/api/subscriptions/admin/__company__/plan"
                    submitLabel={t('s14Wallet.adminSubs.setPlan')}
                    doneText={t('s14Wallet.adminSubs.done')}
                    pathField="companyId"
                    fields={[
                      {
                        name: 'companyId',
                        label: t('s14Wallet.adminSubs.companyId'),
                        required: true,
                      },
                      {
                        name: 'planSlug',
                        label: t('s14Wallet.adminSubs.planSlug'),
                        required: true,
                      },
                      { name: 'note', label: t('s14Wallet.adminSubs.note'), required: true },
                    ]}
                  />
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>{t('s14Wallet.adminSubs.extendTitle')}</CardTitle>
                </CardHeader>
                <CardContent>
                  <JsonForm
                    endpoint="/api/subscriptions/admin/__company__/extend"
                    submitLabel={t('s14Wallet.adminSubs.extend')}
                    doneText={t('s14Wallet.adminSubs.done')}
                    pathField="companyId"
                    fields={[
                      {
                        name: 'companyId',
                        label: t('s14Wallet.adminSubs.companyId'),
                        required: true,
                      },
                      {
                        name: 'days',
                        label: t('s14Wallet.adminSubs.days'),
                        whole: true,
                        required: true,
                      },
                      { name: 'note', label: t('s14Wallet.adminSubs.note'), required: true },
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
