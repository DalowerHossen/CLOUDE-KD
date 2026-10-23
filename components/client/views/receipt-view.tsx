// path: components/client/views/receipt-view.tsx
import type { ReactNode } from 'react';
import { DocumentActions } from '@/components/client/document-actions';
import { RefundRequestForm } from '@/components/client/refund-request-form';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { t } from '@/lib/i18n';
import type { PortalSubject } from '@/services/portal/events';
import { refundOption } from '@/services/dispute/refund-requests';
import { getPortalReceipt } from '@/services/portal/receipt-view';

function Row({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
}): JSX.Element {
  return (
    <div className={`flex justify-between gap-sp-8 text-sm ${strong ? 'font-semibold' : ''}`}>
      <dt>{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  );
}

/** The receipt page of one payment: the facts, any refunds, the checksum, and the PDF. */
export async function renderReceiptView(subject: PortalSubject, token: string): Promise<ReactNode> {
  const receipt = await getPortalReceipt(subject.companyId, subject.docId);
  const option = await refundOption(subject.companyId, subject.docId).catch(() => null);
  const hasSurcharge = !/^0+(\.0+)?$/.test(receipt.surcharge);
  const hasRefund = !/^0+(\.0+)?$/.test(receipt.refunded);
  return (
    <article className="space-y-sp-16" aria-labelledby="receipt-title">
      <Card>
        <CardHeader className="gap-sp-8">
          <CardTitle>
            <span id="receipt-title">{t('s13Portal.receipt.title')}</span> {receipt.reference}
          </CardTitle>
          <p className="text-sm text-muted-foreground">{receipt.companyName}</p>
        </CardHeader>
        <CardContent className="space-y-sp-12">
          <dl className="space-y-1">
            <Row label={t('s13Portal.receipt.paidOn')} value={receipt.paidAt} />
            <Row label={t('s13Portal.receipt.client')} value={receipt.clientName} />
            <Row label={t('s13Portal.receipt.invoice')} value={receipt.invoiceNumber} />
            <Row
              label={t('s13Portal.receipt.method')}
              value={`${receipt.method} (${receipt.processorName})`}
            />
            <Row label={t('s13Portal.receipt.amount')} value={`USD ${receipt.amount}`} />
            {hasSurcharge ? (
              <Row label={t('s13Portal.receipt.surcharge')} value={`USD ${receipt.surcharge}`} />
            ) : null}
            <Row label={t('s13Portal.receipt.total')} value={`USD ${receipt.total}`} strong />
            {hasRefund ? (
              <Row label={t('s13Portal.receipt.refunded')} value={`USD ${receipt.refunded}`} />
            ) : null}
          </dl>
          {receipt.refunds.length > 0 ? (
            <ul className="space-y-1 text-sm">
              {receipt.refunds.map((refund) => (
                <li key={`${refund.at}-${refund.amount}`}>
                  {t('s13Portal.receipt.refundLine', { date: refund.at, amount: refund.amount })}
                </li>
              ))}
            </ul>
          ) : null}
          <p className="text-caption text-muted-foreground">
            {t('s13Portal.receipt.checksum', { value: receipt.checksum })}
          </p>
        </CardContent>
      </Card>
      <DocumentActions token={token} fileName={`receipt-${receipt.reference}`} />
      {option?.canRequest ? (
        <RefundRequestForm
          token={token}
          refundable={option.refundable}
          windowDays={option.windowDays}
        />
      ) : option?.blockedReason ? (
        <p className="text-caption text-muted-foreground print:hidden">{option.blockedReason}</p>
      ) : null}
    </article>
  );
}
