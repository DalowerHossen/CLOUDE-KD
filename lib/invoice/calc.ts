// path: lib/invoice/calc.ts
// The invoice calculation engine. Pure, decimal arithmetic through `Money`; no binary floating point anywhere.
//
// Order of work for every line:
//   1. the line price is turned into an amount without tax (when prices include tax, the tax is taken out);
//   2. the line discount and the document discount are taken off (the document discount is shared over the lines in
//      proportion to their amounts, the last line takes the remainder so the shares add up exactly);
//   3. tax is worked out on the amount after discounts ("before tax") or on the amount before discounts ("after tax":
//      the discount then only lowers what is payable);
//   4. rounding follows the chosen policy: each line (and each tax) is rounded, or only the document totals are.
// Shipping, withholding tax and cash rounding are added at document level.
import { Money } from '@/lib/utils/currency';
import {
  cashRoundingAdjustment,
  roundMoney,
  type CashRounding,
  type Precision,
  type RoundingMode,
} from './rounding';

export interface TaxRef {
  code: string;
  name: string;
  /** Percentage with up to four decimal places, for example "7.25". */
  rate: string;
  /** A compound tax is worked out on the amount plus all taxes before it. */
  compound: boolean;
}

export type DiscountKind = 'none' | 'percent' | 'fixed';

export interface CalcLineInput {
  quantity: string;
  unitPrice: string;
  discountKind: DiscountKind;
  discountValue: string;
  taxExempt: boolean;
  taxes: readonly TaxRef[];
}

export interface CalcOptions {
  /** "inclusive": prices already contain tax. "exclusive": tax is added on top. */
  priceMode: 'exclusive' | 'inclusive';
  /** "before_tax": discounts lower the taxable amount. "after_tax": tax is worked out before discounts. */
  discountOrder: 'before_tax' | 'after_tax';
  roundingPolicy: 'per_line' | 'on_total';
  roundingMode: RoundingMode;
  precision: Precision;
  documentDiscountKind: DiscountKind;
  documentDiscountValue: string;
  shippingAmount: string;
  shippingTaxable: boolean;
  shippingTaxes: readonly TaxRef[];
  /** Percentage the client withholds from the payment (withholding tax); "0" for none. */
  withholdingRate: string;
  cashRounding: CashRounding;
}

export interface LineTaxResult {
  code: string;
  name: string;
  rate: string;
  base: string;
  amount: string;
}

export interface CalcLineResult {
  /** Quantity times price, without tax. */
  gross: string;
  lineDiscount: string;
  documentDiscountShare: string;
  /** Amount without tax after all discounts. */
  net: string;
  taxes: LineTaxResult[];
  tax: string;
  /** Net plus tax. */
  total: string;
}

export interface TaxBreakdownRow {
  code: string;
  name: string;
  rate: string;
  base: string;
  amount: string;
}

export interface CalcResult {
  lines: CalcLineResult[];
  /** Sum of the line amounts before discounts, without tax. */
  subtotal: string;
  lineDiscountTotal: string;
  documentDiscount: string;
  /** Amount without tax after all discounts, shipping not included. */
  netTotal: string;
  shipping: string;
  shippingTax: string;
  taxTotal: string;
  taxBreakdown: TaxBreakdownRow[];
  /** Moves the total to the chosen cash rounding step; "0.0000" when none. */
  roundingAdjustment: string;
  total: string;
  withholding: string;
  /** What the client has to pay: total plus rounding adjustment minus withholding. */
  amountDue: string;
  /**
   * Difference between the sum of the rounded line totals and the rounded document total. It is not zero only when
   * rounding is done on the total; it lets the screen show a reconciliation line.
   */
  roundingDifference: string;
}

export const DEFAULT_CALC_OPTIONS: CalcOptions = {
  priceMode: 'exclusive',
  discountOrder: 'before_tax',
  roundingPolicy: 'per_line',
  roundingMode: 'half_up',
  precision: 2,
  documentDiscountKind: 'none',
  documentDiscountValue: '0',
  shippingAmount: '0',
  shippingTaxable: false,
  shippingTaxes: [],
  withholdingRate: '0',
  cashRounding: '0',
};

const SCALE = 10n ** 12n;

/** Rate text such as "7.25" as an integer of ten-thousandths of a percent (72500). */
function rateUnits(rate: string): bigint {
  const [whole = '0', fraction = ''] = rate.split('.');
  return BigInt(whole) * 10_000n + BigInt(fraction.padEnd(4, '0').slice(0, 4));
}

/**
 * The factor that turns an amount without tax into an amount with tax, as decimal text with twelve places. A
 * compound tax is worked out on the amount plus the taxes before it. Integer arithmetic, so it is exact enough that
 * dividing by it never loses more than the last of the four stored places.
 */
export function taxMultiplier(taxes: readonly TaxRef[]): string {
  let m = SCALE;
  for (const t of taxes) {
    const base = t.compound ? m : SCALE;
    m += (base * rateUnits(t.rate)) / 1_000_000n;
  }
  const whole = m / SCALE;
  const frac = (m % SCALE).toString().padStart(12, '0');
  return `${whole.toString()}.${frac}`;
}

function sign(value: Money): 1 | -1 {
  return value.isNegative() ? -1 : 1;
}

function minAbs(a: Money, b: Money): Money {
  return a.abs().lte(b.abs()) ? a.abs() : b.abs();
}

function discountOf(gross: Money, kind: DiscountKind, value: string): Money {
  if (kind === 'none') return Money.zero();
  if (kind === 'percent') return gross.percent(value);
  // A fixed discount lowers the absolute amount and can never turn the line around.
  const amount = minAbs(Money.parse(value), gross);
  return sign(gross) === -1 ? amount.negate() : amount;
}

interface TaxOn {
  list: LineTaxResult[];
  total: Money;
}

/** Tax on an amount without tax: each tax in order; a compound tax also includes the taxes before it. */
function taxOn(base: Money, taxes: readonly TaxRef[], round: (m: Money) => Money): TaxOn {
  const list: LineTaxResult[] = [];
  let running = base;
  let total = Money.zero();
  for (const t of taxes) {
    const on = t.compound ? running : base;
    const amount = round(on.percent(t.rate));
    list.push({
      code: t.code,
      name: t.name,
      rate: t.rate,
      base: on.toDbString(),
      amount: amount.toDbString(),
    });
    running = running.add(amount);
    total = total.add(amount);
  }
  return { list, total };
}

/** Moves the difference to the last tax, so that net plus tax is exactly the price the client sees. */
function settleLastTax(t: TaxOn, wanted: Money): TaxOn {
  const last = t.list[t.list.length - 1];
  if (!last) return t;
  const others = t.total.sub(Money.parse(last.amount));
  const amount = wanted.sub(others);
  return {
    list: [...t.list.slice(0, -1), { ...last, amount: amount.toDbString() }],
    total: wanted,
  };
}

export function calculate(
  lines: readonly CalcLineInput[],
  options: CalcOptions = DEFAULT_CALC_OPTIONS,
): CalcResult {
  const perLine = options.roundingPolicy === 'per_line';
  const rnd = (m: Money): Money => roundMoney(m, options.precision, options.roundingMode);
  const lineRound = (m: Money): Money => (perLine ? rnd(m) : m);
  const inclusive = options.priceMode === 'inclusive';
  const afterTax = options.discountOrder === 'after_tax';

  // Steps 1 and 2a: amount without tax and line discount.
  const prepared = lines.map((line) => {
    const taxes = line.taxExempt ? [] : line.taxes;
    const multiplier = taxMultiplier(taxes);
    const toEx = (m: Money): Money => (inclusive ? m.div(multiplier) : m);
    const entered = Money.parse(line.unitPrice).mul(line.quantity);
    const discount = discountOf(entered, line.discountKind, line.discountValue);
    return {
      taxes,
      multiplier,
      toEx,
      entered,
      gross: lineRound(toEx(entered)),
      lineDiscount: lineRound(toEx(discount)),
    };
  });

  // Step 2b: the document discount, shared over the lines that have a positive amount.
  const nets = prepared.map((p) => p.gross.sub(p.lineDiscount));
  const positive = nets.map((n, i) => ({ n, i })).filter((x) => x.n.isPositive());
  const positiveSum = Money.sum(positive.map((x) => x.n));
  const allNetsSum = Money.sum(nets);
  let docTotal = Money.zero();
  if (options.documentDiscountKind === 'percent')
    docTotal = allNetsSum.percent(options.documentDiscountValue);
  else if (options.documentDiscountKind === 'fixed')
    docTotal = Money.min(Money.parse(options.documentDiscountValue), positiveSum);
  if (docTotal.isNegative()) docTotal = Money.zero();
  const shares = nets.map(() => Money.zero());
  if (docTotal.isPositive() && positiveSum.isPositive()) {
    // A fixed amount is in the same basis as the prices (so it includes tax when prices do); a percentage is not.
    const enteredBasis = inclusive && options.documentDiscountKind === 'fixed';
    const wanted = lineRound(docTotal);
    let given = Money.zero();
    positive.forEach((x, k) => {
      const share =
        k === positive.length - 1
          ? wanted.sub(given)
          : lineRound(docTotal.mul(x.n.toDbString()).div(positiveSum.toDbString()));
      given = given.add(share);
      const multiplier = prepared[x.i]?.multiplier ?? '1';
      shares[x.i] = enteredBasis ? share.div(multiplier) : share;
    });
  }

  // Steps 3 and 4: tax and rounding per line.
  const results: CalcLineResult[] = [];
  const breakdown = new Map<string, TaxBreakdownRow>();
  const addBreakdown = (rows: readonly LineTaxResult[]): void => {
    for (const r of rows) {
      const key = `${r.code}|${r.rate}`;
      const cur = breakdown.get(key);
      breakdown.set(key, {
        code: r.code,
        name: r.name,
        rate: r.rate,
        base: (cur ? Money.parse(cur.base) : Money.zero()).add(r.base).toDbString(),
        amount: (cur ? Money.parse(cur.amount) : Money.zero()).add(r.amount).toDbString(),
      });
    }
  };
  let subtotal = Money.zero();
  let lineDiscountTotal = Money.zero();
  let docDiscountSum = Money.zero();
  let netSum = Money.zero();
  let taxSum = Money.zero();
  let roundedLineTotals = Money.zero();
  prepared.forEach((p, i) => {
    const share = lineRound(shares[i] ?? Money.zero());
    const net = p.gross.sub(p.lineDiscount).sub(share);
    const taxBase = afterTax ? p.gross : net;
    let tax = taxOn(taxBase, p.taxes, lineRound);
    // With prices that include tax and nothing taken off, net plus tax is exactly the price that was entered.
    if (inclusive && p.taxes.length > 0 && p.lineDiscount.isZero() && share.isZero())
      tax = settleLastTax(tax, p.entered.sub(p.gross));
    const total = net.add(tax.total);
    results.push({
      gross: p.gross.toDbString(),
      lineDiscount: p.lineDiscount.toDbString(),
      documentDiscountShare: share.toDbString(),
      net: net.toDbString(),
      taxes: tax.list,
      tax: tax.total.toDbString(),
      total: total.toDbString(),
    });
    addBreakdown(tax.list);
    subtotal = subtotal.add(p.gross);
    lineDiscountTotal = lineDiscountTotal.add(p.lineDiscount);
    docDiscountSum = docDiscountSum.add(share);
    netSum = netSum.add(net);
    taxSum = taxSum.add(tax.total);
    roundedLineTotals = roundedLineTotals.add(rnd(total));
  });

  // Shipping.
  const shippingEntered = Money.parse(options.shippingAmount);
  const shippingTaxes = options.shippingTaxable ? options.shippingTaxes : [];
  const shippingMultiplier = taxMultiplier(shippingTaxes);
  const shippingEx = lineRound(
    inclusive ? shippingEntered.div(shippingMultiplier) : shippingEntered,
  );
  let shippingTax = taxOn(shippingEx, shippingTaxes, lineRound);
  if (inclusive && shippingTaxes.length > 0)
    shippingTax = settleLastTax(shippingTax, shippingEntered.sub(shippingEx));
  addBreakdown(shippingTax.list);

  // Document totals. When rounding is done on the total, the parts are rounded here.
  const finish = (m: Money): Money => (perLine ? m : rnd(m));
  const rows = [...breakdown.values()].map((r) => ({
    ...r,
    base: finish(Money.parse(r.base)).toDbString(),
    amount: finish(Money.parse(r.amount)).toDbString(),
  }));
  const taxTotalAll = perLine
    ? taxSum.add(shippingTax.total)
    : Money.sum(rows.map((r) => Money.parse(r.amount)));
  const shippingPart = finish(shippingEx);
  const shippingTaxPart = finish(shippingTax.total);
  const subtotalPart = finish(subtotal);
  const lineDiscPart = finish(lineDiscountTotal);
  const docDiscPart = finish(docDiscountSum);
  const netPart = subtotalPart.sub(lineDiscPart).sub(docDiscPart);
  const total = netPart.add(shippingPart).add(taxTotalAll);
  const adjustment = cashRoundingAdjustment(total, options.cashRounding);
  const withholding = rnd(netPart.add(shippingPart).percent(options.withholdingRate));
  const amountDue = total.add(adjustment).sub(withholding);

  return {
    lines: results,
    subtotal: subtotalPart.toDbString(),
    lineDiscountTotal: lineDiscPart.toDbString(),
    documentDiscount: docDiscPart.toDbString(),
    netTotal: netPart.toDbString(),
    shipping: shippingPart.toDbString(),
    shippingTax: shippingTaxPart.toDbString(),
    taxTotal: taxTotalAll.toDbString(),
    taxBreakdown: rows,
    roundingAdjustment: adjustment.toDbString(),
    total: total.toDbString(),
    withholding: withholding.toDbString(),
    amountDue: amountDue.toDbString(),
    roundingDifference: perLine
      ? '0.0000'
      : rnd(roundedLineTotals.add(shippingPart).add(shippingTaxPart)).sub(total).toDbString(),
  };
}
