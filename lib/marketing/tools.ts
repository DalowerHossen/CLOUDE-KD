// path: lib/marketing/tools.ts
// Arithmetic of the free tools. All money goes through Money (decimal.js); rates and quantities are decimal text.
import { Money } from '@/lib/utils/currency';

export interface InvoiceLine {
  description: string;
  quantity: string;
  unitPrice: string;
}

export interface InvoiceTotals {
  lines: { description: string; quantity: string; unitPrice: string; amount: Money }[];
  subtotal: Money;
  discount: Money;
  tax: Money;
  total: Money;
}

const DECIMAL = /^\d{1,9}(\.\d{1,4})?$/;

/** Parses decimal text for a tool field. Empty text counts as zero; anything else that is not a decimal is refused. */
export function readDecimal(text: string): string | null {
  const t = text.trim();
  if (t === '') return '0';
  return DECIMAL.test(t) ? t : null;
}

/** Totals of an invoice: subtotal, percentage discount, tax on the discounted subtotal, and the total. */
export function invoiceTotals(
  lines: readonly InvoiceLine[],
  discountPercent: string,
  taxPercent: string,
): InvoiceTotals | null {
  const discountRate = readDecimal(discountPercent);
  const taxRate = readDecimal(taxPercent);
  if (
    discountRate === null ||
    taxRate === null ||
    Number(discountRate) > 100 ||
    Number(taxRate) > 100
  )
    return null;
  const out: InvoiceTotals['lines'] = [];
  for (const line of lines) {
    const quantity = readDecimal(line.quantity);
    const price = readDecimal(line.unitPrice);
    if (quantity === null || price === null) return null;
    out.push({
      description: line.description,
      quantity,
      unitPrice: price,
      amount: Money.parseRounded(price).mul(quantity),
    });
  }
  const subtotal = Money.sum(out.map((l) => l.amount));
  const discount = subtotal.percent(discountRate);
  const taxable = subtotal.sub(discount);
  const tax = taxable.percent(taxRate);
  return { lines: out, subtotal, discount, tax, total: taxable.add(tax) };
}

export interface LateFee {
  interest: Money;
  flatFee: Money;
  total: Money;
  amountDue: Money;
}

/** Simple interest for the days an invoice is late: amount x annual rate x days / 365, plus an optional flat fee. */
export function lateFee(
  amount: string,
  annualPercent: string,
  daysLate: string,
  flat: string,
): LateFee | null {
  const a = readDecimal(amount);
  const r = readDecimal(annualPercent);
  const d = readDecimal(daysLate);
  const f = readDecimal(flat);
  if (a === null || r === null || d === null || f === null || Number(r) > 100 || Number(d) > 3650)
    return null;
  const principal = Money.parseRounded(a);
  const interest = principal.percent(r).mul(d).div('365');
  const flatFee = Money.parseRounded(f);
  const total = interest.add(flatFee);
  return { interest, flatFee, total, amountDue: principal.add(total) };
}

export interface TaxResult {
  net: Money;
  tax: Money;
  gross: Money;
}

/** Adds tax to a net amount, or takes the tax out of a gross amount. */
export function salesTax(
  amount: string,
  ratePercent: string,
  mode: 'add' | 'extract',
): TaxResult | null {
  const a = readDecimal(amount);
  const r = readDecimal(ratePercent);
  if (a === null || r === null || Number(r) > 100) return null;
  const value = Money.parseRounded(a);
  if (mode === 'add') {
    const tax = value.percent(r);
    return { net: value, tax, gross: value.add(tax) };
  }
  const net = value.mul('100').div(Money.parseRounded(r).add('100').toString());
  return { net, tax: value.sub(net), gross: value };
}

/** "$1,234.50" for display. */
export function formatUsd(amount: Money): string {
  const { negative, integer, fraction } = amount.toParts(2);
  return `${negative ? '-' : ''}$${integer.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${fraction}`;
}
