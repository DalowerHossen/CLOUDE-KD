// path: lib/credit/build.ts
// Works out a credit note from an invoice: all of it with the frozen figures, or chosen quantities of chosen lines with
// the prices, discounts and tax rates the invoice carried. Pure; the service stores the result.
import { ValidationError } from '@/lib/errors';
import { calculate, type CalcLineInput, type CalcOptions, type TaxRef } from '@/lib/invoice/calc';
import { Money } from '@/lib/utils/currency';
import type { CreditCreate } from '@/lib/credit/input';
import type { InvoiceView } from '@/services/invoice/invoices';

export interface CreditLine {
  position: number;
  productId: string | null;
  variantId: string | null;
  sku: string;
  description: string;
  hsCode: string;
  quantity: string;
  unit: string;
  unitPrice: string;
  discountKind: 'none' | 'percent' | 'fixed';
  discountValue: string;
  taxExempt: boolean;
  taxes: TaxRef[];
  net: string;
  tax: string;
  total: string;
}

export interface Built {
  lines: CreditLine[];
  taxBreakdown: InvoiceView['taxBreakdown'];
  subtotal: string;
  taxTotal: string;
  total: string;
  options: Record<string, unknown>;
}

function creditLineOf(l: InvoiceView['lines'][number], quantity: string): CreditLine {
  return {
    position: l.position,
    productId: l.productId,
    variantId: l.variantId,
    sku: l.sku,
    description: l.description,
    hsCode: l.hsCode,
    quantity,
    unit: l.unit,
    unitPrice: l.unitPrice,
    discountKind: l.discountKind,
    discountValue: l.discountValue,
    taxExempt: l.taxExempt,
    taxes: l.taxes,
    net: l.net,
    tax: l.tax,
    total: l.lineTotal,
  };
}

export function buildCredit(
  invoice: InvoiceView,
  input: CreditCreate,
  already: Map<number, Money>,
): Built {
  if (input.mode === 'full') {
    if (already.size > 0)
      throw new ValidationError(
        'Part of this invoice was credited already. Credit chosen lines instead.',
      );
    return {
      lines: invoice.lines.map((l) => creditLineOf(l, l.quantity)),
      taxBreakdown: invoice.taxBreakdown,
      subtotal: invoice.totals.subtotal,
      taxTotal: invoice.totals.taxTotal,
      total: invoice.totals.amountDue,
      options: { mode: 'full' },
    };
  }
  const byPosition = new Map(invoice.lines.map((l) => [l.position, l]));
  const picked: { line: InvoiceView['lines'][number]; quantity: string }[] = [];
  for (const wanted of input.lines) {
    const line = byPosition.get(wanted.position);
    if (!line) throw new ValidationError(`Line ${wanted.position} is not on the invoice.`);
    const qty = Money.parse(wanted.quantity);
    if (qty.isZero()) continue;
    if (Money.parse(line.quantity).isNegative())
      throw new ValidationError('A line with a negative quantity cannot be credited.');
    const left = Money.parse(line.quantity).sub(already.get(line.position) ?? Money.zero());
    if (qty.gt(left))
      throw new ValidationError(
        `Line ${wanted.position} has only ${left.toDbString()} left to credit.`,
      );
    picked.push({ line, quantity: qty.toDbString() });
  }
  if (picked.length === 0) throw new ValidationError('Choose at least one line to credit.');
  const calcLines: CalcLineInput[] = picked.map(({ line, quantity }) => ({
    quantity,
    unitPrice: line.unitPrice,
    discountKind: line.discountKind,
    // A fixed line discount shrinks with the quantity credited.
    discountValue:
      line.discountKind === 'fixed'
        ? Money.parse(line.discountValue).mul(quantity).div(line.quantity).toDbString()
        : line.discountValue,
    taxExempt: line.taxExempt,
    taxes: line.taxes,
  }));
  // A fixed document discount shrinks with the share of the invoice that is credited.
  const originalGross = invoice.lines.reduce((s, l) => s.add(l.gross), Money.zero());
  const creditedGross = picked.reduce(
    (s, { line, quantity }) => s.add(Money.parse(line.gross).mul(quantity).div(line.quantity)),
    Money.zero(),
  );
  const o = invoice.options;
  const docValue =
    o.documentDiscountKind === 'fixed' && originalGross.isPositive()
      ? Money.parse(o.documentDiscountValue)
          .mul(creditedGross.toDbString())
          .div(originalGross.toDbString())
          .toDbString()
      : o.documentDiscountValue;
  const options: CalcOptions = {
    priceMode: o.priceMode,
    discountOrder: o.discountOrder,
    roundingPolicy: o.roundingPolicy,
    roundingMode: o.roundingMode,
    precision: o.precision,
    documentDiscountKind: o.documentDiscountKind,
    documentDiscountValue: docValue,
    shippingAmount: '0',
    shippingTaxable: false,
    shippingTaxes: [],
    withholdingRate: o.withholdingRate,
    cashRounding: '0',
  };
  const r = calculate(calcLines, options);
  return {
    lines: picked.map(({ line, quantity }, i) => ({
      ...creditLineOf(line, quantity),
      discountValue: calcLines[i]?.discountValue ?? line.discountValue,
      net: r.lines[i]?.net ?? '0',
      tax: r.lines[i]?.tax ?? '0',
      total: r.lines[i]?.total ?? '0',
    })),
    taxBreakdown: r.taxBreakdown,
    subtotal: r.subtotal,
    taxTotal: r.taxTotal,
    total: r.amountDue,
    options: { mode: 'lines', documentDiscountValue: docValue },
  };
}
