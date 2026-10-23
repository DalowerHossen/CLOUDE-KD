// path: app/(dashboard)/payments/[id]/page.tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { RefundForm } from '@/components/payment/refund-form';
import { PageHeader } from '@/components/shared/page-header';
import { ErrorState } from '@/components/shared/state-views';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { REFUND_APPROVAL_THRESHOLD_USD } from '@/config/payment-risk';
import { getService } from '@/lib/container';
import { NotFoundError } from '@/lib/errors';
import { t, type StringKey } from '@/lib/i18n';
import { Money } from '@/lib/utils/currency';
import { formatMoney } from '@/lib/utils/formatting';
import { requirePagePermission } from '@/services/base/page-guard';
import { paymentDetail, type PaymentDetail } from '@/services/payment/payment-detail';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Payment' };

const money = (v: string): string => formatMoney(Money.parse(v));

export default async function PaymentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<JSX.Element> {
  const actor = await requirePagePermission('payment.read', 'tenant', 'payment');
  const { id } = await params;
  let detail: PaymentDetail | null = null;
  try {
    detail = await paymentDetail(actor.companyId as string, id);
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
  }
  const canRefund = await getService('permissions').can(actor, 'payment.refund', {
    type: 'payment',
    id,
  });
  if (detail === null) {
    return <ErrorState description={t('s10Payments.detail.loadError')} />;
  }
  const status = detail.payment.status;
  const left = Money.parse(detail.capturedAmount).sub(Money.parse(detail.refundedAmount));
  return (
    <div className="space-y-sp-16">
      <PageHeader
        title={t('s10Payments.detail.title')}
        description={`USD ${detail.payment.amount.toDbString()}`}
        actions={
          <Button asChild variant="outline">
            <Link href="/payments">{t('s10Payments.detail.back')}</Link>
          </Button>
        }
      />
      <dl className="grid gap-sp-12 rounded-lg border p-sp-16 text-sm sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <dt className="text-muted-foreground">{t('s10Payments.list.columns.status')}</dt>
          <dd>
            <Badge variant="outline">{t(`s10Payments.statuses.${status}` as StringKey)}</Badge>
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">{t('s10Payments.detail.amount')}</dt>
          <dd className="font-semibold">{money(detail.payment.amount.toDbString())}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">{t('s10Payments.detail.surcharge')}</dt>
          <dd>{money(detail.surchargeAmount)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">{t('s10Payments.detail.captured')}</dt>
          <dd>{money(detail.capturedAmount)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">{t('s10Payments.detail.refunded')}</dt>
          <dd>{money(detail.refundedAmount)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">{t('s10Payments.detail.method')}</dt>
          <dd>{detail.paymentMethod}</dd>
        </div>
        {detail.payment.failureReason ? (
          <div>
            <dt className="text-muted-foreground">{t('s10Payments.detail.reason')}</dt>
            <dd>{detail.payment.failureReason}</dd>
          </div>
        ) : null}
      </dl>
      {canRefund && (status === 'captured' || status === 'partially_refunded') && left.gt('0') ? (
        <RefundForm
          paymentId={id}
          left={left.toDbString()}
          threshold={REFUND_APPROVAL_THRESHOLD_USD}
        />
      ) : null}
      <section className="space-y-sp-8">
        <h2 className="text-lg font-semibold">{t('s10Payments.detail.refunds')}</h2>
        {detail.refunds.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('s10Payments.detail.noRefunds')}</p>
        ) : (
          <ul className="space-y-sp-8">
            {detail.refunds.map((r) => (
              <li
                key={r.id}
                className="flex flex-wrap items-center gap-2 rounded-md border p-sp-12 text-sm"
              >
                <span className="font-medium">{money(r.amount)}</span>
                <Badge variant="outline">
                  {t(`s10Payments.detail.refundStatuses.${r.status}` as StringKey)}
                </Badge>
                <span className="text-muted-foreground">
                  {r.createdAt.replace('T', ' ').slice(0, 16)}
                </span>
                {r.reason ? <span>{r.reason}</span> : null}
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="space-y-sp-8">
        <h2 className="text-lg font-semibold">{t('s10Payments.detail.attempts')}</h2>
        <ul className="space-y-1 text-sm">
          {detail.attempts.map((a, i) => (
            <li key={`${a.createdAt}-${i}`} className="flex flex-wrap gap-2">
              <span className="text-muted-foreground">
                {a.createdAt.replace('T', ' ').slice(0, 19)}
              </span>
              <span>{a.action}</span>
              <span>{a.outcome}</span>
              {a.declineCategory ? <span>{a.declineCategory}</span> : null}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
