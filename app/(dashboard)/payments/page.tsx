// path: app/(dashboard)/payments/page.tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import { DataTable, type DataColumn } from '@/components/shared/data-table';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState, ErrorState } from '@/components/shared/state-views';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { t, type StringKey } from '@/lib/i18n';
import { Money } from '@/lib/utils/currency';
import { formatMoney } from '@/lib/utils/formatting';
import { requirePagePermission } from '@/services/base/page-guard';
import { paymentListView, type PaymentListItem } from '@/services/payment/payment-detail';
import { paymentReport, type PaymentReport } from '@/services/payment/reports';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Payments' };

const STATUSES = [
  'captured',
  'pending_review',
  'failed',
  'refunded',
  'partially_refunded',
  'voided',
] as const;
const money = (v: string): string => formatMoney(Money.parse(v));

const columns: readonly DataColumn<PaymentListItem>[] = [
  {
    key: 'date',
    header: t('s10Payments.list.columns.date'),
    primary: true,
    cell: (r) => r.createdAt.replace('T', ' ').slice(0, 16),
  },
  { key: 'invoice', header: t('s10Payments.list.columns.invoice'), cell: (r) => r.invoiceNumber },
  { key: 'amount', header: t('s10Payments.list.columns.amount'), cell: (r) => money(r.amount) },
  {
    key: 'status',
    header: t('s10Payments.list.columns.status'),
    cell: (r) => (
      <Badge variant="outline">{t(`s10Payments.statuses.${r.status}` as StringKey)}</Badge>
    ),
  },
  {
    key: 'processor',
    header: t('s10Payments.list.columns.processor'),
    hideOnMobile: true,
    cell: (r) => r.processorId ?? '',
  },
  {
    key: 'open',
    header: '',
    cell: (r) => (
      <Link className="underline" href={`/payments/${r.id}`}>
        {t('s10Payments.list.open')}
      </Link>
    ),
  },
];

export default async function PaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}): Promise<JSX.Element> {
  const actor = await requirePagePermission('payment.read', 'tenant', 'payment');
  const companyId = actor.companyId as string;
  const { status } = await searchParams;
  const active = STATUSES.find((s) => s === status) ?? null;
  let rows: PaymentListItem[] | null;
  let report: PaymentReport | null;
  try {
    rows = await paymentListView(companyId, { status: active ?? undefined, limit: 100 });
  } catch {
    rows = null;
  }
  try {
    const to = new Date();
    report = await paymentReport(companyId, new Date(to.getTime() - 30 * 86_400_000), to);
  } catch {
    report = null;
  }
  return (
    <div className="space-y-sp-16">
      <PageHeader
        title={t('s10Payments.list.title')}
        description={t('s10Payments.list.description')}
        actions={
          <Button asChild variant="outline">
            <Link href="/payments/links">{t('s10Payments.list.openLinks')}</Link>
          </Button>
        }
      />
      {report ? (
        <Card>
          <CardHeader>
            <CardTitle>{t('s10Payments.list.report.title')}</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-sp-12 text-sm sm:grid-cols-3 lg:grid-cols-6">
              <div>
                <dt className="text-muted-foreground">{t('s10Payments.list.report.captured')}</dt>
                <dd className="font-semibold">{money(report.capturedTotal)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">{t('s10Payments.list.report.refunded')}</dt>
                <dd className="font-semibold">{money(report.refundedTotal)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">{t('s10Payments.list.report.net')}</dt>
                <dd className="font-semibold">{money(report.netTotal)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">
                  {t('s10Payments.list.report.successRate')}
                </dt>
                <dd className="font-semibold">
                  {report.successRate === null
                    ? t('s10Payments.list.report.none')
                    : `${report.successRate}%`}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">{t('s10Payments.list.report.failed')}</dt>
                <dd className="font-semibold">{report.failedCount}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">{t('s10Payments.list.report.review')}</dt>
                <dd className="font-semibold">{report.reviewCount}</dd>
              </div>
            </dl>
          </CardContent>
        </Card>
      ) : null}
      <nav className="flex flex-wrap gap-2" aria-label={t('s10Payments.list.title')}>
        <Button asChild size="sm" variant={active === null ? 'default' : 'outline'}>
          <Link href="/payments">{t('s10Payments.list.filterAll')}</Link>
        </Button>
        {STATUSES.map((s) => (
          <Button key={s} asChild size="sm" variant={active === s ? 'default' : 'outline'}>
            <Link href={`/payments?status=${s}`}>
              {t(`s10Payments.statuses.${s}` as StringKey)}
            </Link>
          </Button>
        ))}
      </nav>
      {rows === null ? (
        <ErrorState description={t('s10Payments.list.loadError')} />
      ) : (
        <DataTable
          columns={columns}
          rows={rows}
          getRowId={(r) => r.id}
          caption={t('s10Payments.list.title')}
          empty={<EmptyState title={t('s10Payments.list.empty')} />}
        />
      )}
    </div>
  );
}
