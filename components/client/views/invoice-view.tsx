// path: components/client/views/invoice-view.tsx
import { Check } from 'lucide-react';
import type { ReactNode } from 'react';
import { InvoiceActions } from '@/components/client/invoice-actions';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { t } from '@/lib/i18n';
import type { AddressBlock } from '@/lib/invoice/input';
import { getPortalInvoice } from '@/services/portal/invoice-view';
import type { PortalSubject } from '@/services/portal/events';

const STATUS_KEYS: Readonly<Record<string, string>> = {
  sent: 's13Portal.invoice.statusSent',
  viewed: 's13Portal.invoice.statusViewed',
  overdue: 's13Portal.invoice.statusOverdue',
  partially_paid: 's13Portal.invoice.statusPartially_paid',
  paid: 's13Portal.invoice.statusPaid',
  void: 's13Portal.invoice.statusVoid',
  disputed: 's13Portal.invoice.statusDisputed',
};

function badgeVariant(
  status: string,
): 'success' | 'warning' | 'destructive' | 'info' | 'secondary' {
  if (status === 'paid') return 'success';
  if (status === 'overdue' || status === 'disputed') return 'destructive';
  if (status === 'partially_paid') return 'warning';
  if (status === 'void') return 'secondary';
  return 'info';
}

function Address({ title, block }: { title: string; block: AddressBlock }): JSX.Element {
  const lines = [
    block.name,
    block.contactName,
    block.line1,
    block.line2,
    [block.city, block.region, block.postalCode].filter(Boolean).join(', '),
    block.country ?? '',
  ].filter((line) => line !== '');
  return (
    <div className="space-y-1">
      <h2 className="text-caption font-semibold uppercase text-muted-foreground">{title}</h2>
      {lines.map((line, index) => (
        <p key={`${index}-${line}`} className="text-sm">
          {line}
        </p>
      ))}
    </div>
  );
}

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

function zero(value: string): boolean {
  return /^-?0+(\.0+)?$/.test(value);
}

/** The client's page for one invoice: the same content as the PDF, with pay, download, print and contact buttons. */
export async function renderInvoiceView(subject: PortalSubject, token: string): Promise<ReactNode> {
  const { data, status, canPay, canCancel, steps } = await getPortalInvoice(subject);
  const seller = data.seller;
  const statusKey = STATUS_KEYS[status];
  const timeline: ReadonlyArray<readonly [string, boolean]> = [
    [t('s13Portal.invoice.stepSent'), steps.sent],
    [t('s13Portal.invoice.stepViewed'), steps.viewed],
    [t('s13Portal.invoice.stepPaid'), steps.paid],
  ];
  const remit = seller.remitTo;
  return (
    <article className="space-y-sp-16" aria-labelledby="invoice-title">
      <Card>
        <CardHeader className="gap-sp-8">
          <div className="flex flex-wrap items-center justify-between gap-sp-8">
            <CardTitle>
              <span id="invoice-title">{data.title}</span> {data.number}
            </CardTitle>
            {statusKey ? (
              <Badge variant={badgeVariant(status)}>
                {t(statusKey as 's13Portal.invoice.statusSent')}
              </Badge>
            ) : null}
          </div>
          <p className="text-sm text-muted-foreground">
            {seller.legalName || seller.name}
            {seller.taxId
              ? ` - ${seller.taxLabel || t('s13Portal.invoice.taxId')} ${seller.taxId}`
              : ''}
          </p>
        </CardHeader>
        <CardContent className="space-y-sp-16">
          <div className="grid gap-sp-16 sm:grid-cols-2">
            <Address title={t('s13Portal.invoice.billTo')} block={data.billTo} />
            {data.shipTo ? (
              <Address title={t('s13Portal.invoice.shipTo')} block={data.shipTo} />
            ) : null}
          </div>
          <dl className="grid gap-1 sm:grid-cols-2">
            <Row label={t('s13Portal.invoice.issued')} value={data.issueDate} />
            <Row label={data.dueLabel} value={`${data.dueDate} (${data.termsLabel})`} />
            {data.poNumber ? (
              <Row label={t('s13Portal.invoice.reference')} value={data.poNumber} />
            ) : null}
          </dl>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] text-sm">
              <thead>
                <tr className="border-b text-left text-caption uppercase text-muted-foreground">
                  <th scope="col" className="py-2 pr-2">
                    {t('s13Portal.invoice.description')}
                  </th>
                  <th scope="col" className="py-2 pr-2 text-right">
                    {t('s13Portal.invoice.quantity')}
                  </th>
                  <th scope="col" className="py-2 pr-2 text-right">
                    {t('s13Portal.invoice.unitPrice')}
                  </th>
                  <th scope="col" className="py-2 text-right">
                    {t('s13Portal.invoice.amount')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.lines.map((line) => (
                  <tr key={line.position} className="border-b align-top">
                    <td className="py-2 pr-2">{line.description}</td>
                    <td className="py-2 pr-2 text-right tabular-nums">
                      {line.quantity} {line.unit}
                    </td>
                    <td className="py-2 pr-2 text-right tabular-nums">{line.unitPrice}</td>
                    <td className="py-2 text-right tabular-nums">{line.total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <dl className="ml-auto w-full max-w-xs space-y-1">
            <Row label={t('s13Portal.invoice.subtotal')} value={data.totals.subtotal} />
            {!zero(data.totals.discounts) ? (
              <Row label={t('s13Portal.invoice.discounts')} value={data.totals.discounts} />
            ) : null}
            {!zero(data.totals.shipping) ? (
              <Row label={t('s13Portal.invoice.shipping')} value={data.totals.shipping} />
            ) : null}
            {!zero(data.totals.tax) ? (
              <Row label={t('s13Portal.invoice.tax')} value={data.totals.tax} />
            ) : null}
            {!zero(data.totals.rounding) ? (
              <Row label={t('s13Portal.invoice.rounding')} value={data.totals.rounding} />
            ) : null}
            <Row label={t('s13Portal.invoice.total')} value={data.totals.total} strong />
            {!zero(data.totals.withheld) ? (
              <Row label={t('s13Portal.invoice.withheld')} value={data.totals.withheld} />
            ) : null}
            {!zero(data.totals.paid) ? (
              <Row label={t('s13Portal.invoice.paid')} value={data.totals.paid} />
            ) : null}
            <Row label={data.dueTotalLabel} value={`USD ${data.totals.amountDue}`} strong />
          </dl>
          {data.amountInWords ? (
            <p className="text-sm">
              <span className="font-semibold">{t('s13Portal.invoice.inWords')}: </span>
              {data.amountInWords}
            </p>
          ) : null}
          {data.reverseCharge ? (
            <p className="text-sm">{t('s13Portal.invoice.reverseCharge')}</p>
          ) : null}
          {data.taxExempt ? <p className="text-sm">{t('s13Portal.invoice.taxExempt')}</p> : null}
        </CardContent>
      </Card>
      <InvoiceActions
        token={token}
        canPay={canPay}
        canCancel={canCancel}
        contactEmail={seller.email}
        invoiceNumber={data.number}
      />
      {remit ? (
        <Card>
          <CardHeader>
            <CardTitle>{t('s13Portal.invoice.remitTo')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            {[
              remit.bankName,
              remit.accountName,
              remit.accountNumber,
              remit.routingNumber,
              remit.swift,
              remit.iban,
              remit.instructions,
            ]
              .filter((line) => line !== '')
              .map((line) => (
                <p key={line}>{line}</p>
              ))}
          </CardContent>
        </Card>
      ) : null}
      {data.notes || seller.terms ? (
        <Card>
          <CardContent className="space-y-sp-12 pt-sp-16 text-sm">
            {data.notes ? (
              <div>
                <h2 className="font-semibold">{t('s13Portal.invoice.notes')}</h2>
                <p className="whitespace-pre-line">{data.notes}</p>
              </div>
            ) : null}
            {seller.terms ? (
              <div>
                <h2 className="font-semibold">{t('s13Portal.invoice.terms')}</h2>
                <p className="whitespace-pre-line">{seller.terms}</p>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}
      <nav aria-label={t('s13Portal.invoice.timeline')} className="print:hidden">
        <ol className="flex justify-between gap-sp-8 text-caption">
          {timeline.map(([label, done]) => (
            <li
              key={label}
              className={done ? 'font-semibold text-success' : 'text-muted-foreground'}
            >
              {done ? <Check className="mr-1 inline h-3 w-3" aria-hidden="true" /> : null}
              {label}
            </li>
          ))}
        </ol>
      </nav>
      {seller.footer ? (
        <p className="text-center text-caption text-muted-foreground">{seller.footer}</p>
      ) : null}
    </article>
  );
}
