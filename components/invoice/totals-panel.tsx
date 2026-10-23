// path: components/invoice/totals-panel.tsx
'use client';
import { t } from '@/lib/i18n';
import type { CalcResult } from '@/lib/invoice/calc';
import { amountInWords } from '@/lib/invoice/words';
import { convertUsd } from '@/lib/fx/rates';
import { Money } from '@/lib/utils/currency';
import { formatMoney } from '@/lib/utils/formatting';

const money = (v: string): string => formatMoney(Money.parse(v));

export function TotalsPanel({
  result,
  displayCurrency,
  fxRate,
}: {
  result: CalcResult;
  displayCurrency: string | null;
  fxRate: string | null;
}): JSX.Element {
  const discounts = Money.parse(result.lineDiscountTotal).add(result.documentDiscount).toDbString();
  const hasWithholding = !Money.parse(result.withholding).isZero();
  const hasRounding = !Money.parse(result.roundingAdjustment).isZero();
  return (
    <section className="space-y-sp-8 text-sm" aria-label={t('s09Invoicing.invoices.calculation')}>
      <dl className="ml-auto grid max-w-sm grid-cols-2 gap-sp-4">
        <dt>{t('s09Invoicing.invoices.subtotal')}</dt>
        <dd className="text-right">{money(result.subtotal)}</dd>
        {Money.parse(discounts).isZero() ? null : (
          <>
            <dt>{t('s09Invoicing.invoices.discounts')}</dt>
            <dd className="text-right">-{money(discounts)}</dd>
          </>
        )}
        {Money.parse(result.shipping).isZero() ? null : (
          <>
            <dt>{t('s09Invoicing.invoices.shippingTotal')}</dt>
            <dd className="text-right">{money(result.shipping)}</dd>
          </>
        )}
        <dt>{t('s09Invoicing.invoices.taxTotal')}</dt>
        <dd className="text-right">{money(result.taxTotal)}</dd>
        {hasRounding ? (
          <>
            <dt>{t('s09Invoicing.invoices.roundingAdjustment')}</dt>
            <dd className="text-right">{money(result.roundingAdjustment)}</dd>
          </>
        ) : null}
        <dt className="font-semibold">{t('s09Invoicing.invoices.grandTotal')}</dt>
        <dd className="text-right font-semibold">{money(result.total)}</dd>
        {hasWithholding ? (
          <>
            <dt>{t('s09Invoicing.invoices.withheld')}</dt>
            <dd className="text-right">-{money(result.withholding)}</dd>
          </>
        ) : null}
        <dt className="font-semibold">{t('s09Invoicing.invoices.amountDue')}</dt>
        <dd className="text-right font-semibold">{money(result.amountDue)}</dd>
        {displayCurrency && fxRate ? (
          <>
            <dt>{displayCurrency}</dt>
            <dd className="text-right">
              {convertUsd(Money.parse(result.amountDue), fxRate, displayCurrency)}
            </dd>
          </>
        ) : null}
      </dl>
      <p>
        <span className="font-medium">{t('s09Invoicing.invoices.inWords')}: </span>
        {amountInWords(Money.parse(result.amountDue))}
      </p>
      {result.taxBreakdown.length > 0 ? (
        <table className="w-full max-w-md">
          <caption className="text-left font-medium">
            {t('s09Invoicing.invoices.taxBreakdown')}
          </caption>
          <thead>
            <tr className="text-left">
              <th scope="col">{t('s09Invoicing.invoices.taxes')}</th>
              <th scope="col" className="text-right">
                {t('s09Invoicing.invoices.rate')}
              </th>
              <th scope="col" className="text-right">
                {t('s09Invoicing.invoices.base')}
              </th>
              <th scope="col" className="text-right">
                {t('s09Invoicing.invoices.taxTotal')}
              </th>
            </tr>
          </thead>
          <tbody>
            {result.taxBreakdown.map((r) => (
              <tr key={`${r.code}-${r.rate}`}>
                <td>{r.code}</td>
                <td className="text-right">
                  {r.rate.replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '')}%
                </td>
                <td className="text-right">{money(r.base)}</td>
                <td className="text-right">{money(r.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </section>
  );
}
