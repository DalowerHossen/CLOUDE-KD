// path: app/(dashboard)/subscriptions/billing/invoices/[id]/page.tsx
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/shared/page-header';
import { ErrorState } from '@/components/shared/state-views';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { NotFoundError } from '@/lib/errors';
import { t, type StringKey } from '@/lib/i18n';
import { requirePagePermission } from '@/services/base/page-guard';
import { getPlatformInvoice, type PlatformInvoiceView } from '@/services/subscription/invoices';
import { loadBilling, type BillingSettings } from '@/services/subscription/settings';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Invoice' };

export default async function InvoicePage({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<JSX.Element> {
  const actor = await requirePagePermission('subscription.read', 'tenant', 'platform_invoice');
  const { id } = await params;
  let invoice: PlatformInvoiceView | null = null;
  let billing: BillingSettings | null = null;
  try {
    [invoice, billing] = await Promise.all([
      getPlatformInvoice(id, actor.companyId as string),
      loadBilling(),
    ]);
  } catch (thrown) {
    if (thrown instanceof NotFoundError) notFound();
    invoice = null;
  }
  if (!invoice || !billing) return <ErrorState description={t('s14Wallet.common.loadError')} />;
  const paid = invoice.status === 'paid';
  return (
    <div className="space-y-sp-16">
      <PageHeader
        title={
          paid
            ? t('s14Wallet.billing.receiptPage', { number: invoice.number })
            : t('s14Wallet.billing.invoicePage', { number: invoice.number })
        }
        description={invoice.description}
      />
      <Card>
        <CardContent className="space-y-sp-16 pt-sp-16">
          <div className="grid gap-sp-12 sm:grid-cols-2">
            <div>
              <h2 className="font-semibold">{t('s14Wallet.billing.from')}</h2>
              <p>{billing.sellerName}</p>
              <p className="whitespace-pre-line text-sm text-muted-foreground">
                {billing.sellerAddress}
              </p>
              {billing.sellerTaxId ? <p className="text-sm">{billing.sellerTaxId}</p> : null}
            </div>
            <div>
              <h2 className="font-semibold">{t('s14Wallet.billing.billedTo')}</h2>
              <p>{invoice.buyerName}</p>
              <p className="text-sm text-muted-foreground">{invoice.buyerCountry ?? ''}</p>
              <p className="text-sm">
                <Badge variant="outline">
                  {t(`s14Wallet.billing.invoiceStatuses.${invoice.status}` as StringKey)}
                </Badge>{' '}
                {invoice.issuedAt.slice(0, 10)} - {invoice.dueAt.slice(0, 10)}
              </p>
            </div>
          </div>
          <table className="w-full text-sm">
            <tbody>
              {invoice.items.map((i) => (
                <tr key={i.position} className="border-b">
                  <td className="py-1">{i.description}</td>
                  <td className="py-1 text-right">
                    {i.quantity} x {i.unitAmount}
                  </td>
                  <td className="py-1 text-right">{i.amount}</td>
                </tr>
              ))}
              <tr>
                <td className="py-1" colSpan={2}>
                  {t('s14Wallet.billing.subtotal')}
                </td>
                <td className="py-1 text-right">{invoice.subtotal}</td>
              </tr>
              <tr>
                <td className="py-1" colSpan={2}>
                  {t('s14Wallet.billing.tax', { percent: invoice.taxPercent })}
                </td>
                <td className="py-1 text-right">{invoice.taxAmount}</td>
              </tr>
              <tr className="font-semibold">
                <td className="py-1" colSpan={2}>
                  {t('s14Wallet.billing.total')} (USD)
                </td>
                <td className="py-1 text-right">{invoice.total}</td>
              </tr>
            </tbody>
          </table>
          {paid ? (
            <p>
              {t('s14Wallet.billing.paidOn', {
                date: (invoice.paidAt ?? '').slice(0, 10),
                method: invoice.paymentMethod ?? '',
                reference: invoice.paymentReference ?? '',
              })}
            </p>
          ) : invoice.status === 'open' ? (
            <div>
              <h2 className="font-semibold">{t('s14Wallet.billing.howToPay')}</h2>
              <p className="whitespace-pre-line text-sm">
                {billing.bankInstructions || t('s14Wallet.billing.noBank')}
              </p>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
