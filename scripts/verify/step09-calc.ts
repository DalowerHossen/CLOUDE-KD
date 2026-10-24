// path: scripts/verify/step09-calc.ts
// Hand-calculated cases for the invoice calculation engine. Run: npx tsx scripts/verify/step09-calc.ts
import assert from 'node:assert/strict';
import {
  calculate,
  DEFAULT_CALC_OPTIONS,
  taxMultiplier,
  type CalcLineInput,
  type CalcOptions,
  type TaxRef,
} from '@/lib/invoice/calc';
import { roundMoney } from '@/lib/invoice/rounding';
import { amountInWords, integerWords } from '@/lib/invoice/words';
import { Money } from '@/lib/utils/currency';

let failures = 0;
function check(name: string, fn: () => void): void {
  try {
    fn();
    process.stdout.write(`ok    ${name}\n`);
  } catch (error) {
    failures += 1;
    process.stderr.write(
      `FAIL  ${name}: ${error instanceof Error ? error.message : String(error)}\n`,
    );
  }
}

const vat = (rate: string, compound = false, code = 'VAT'): TaxRef => ({
  code,
  name: code,
  rate,
  compound,
});
const line = (price: string, qty = '1', extra: Partial<CalcLineInput> = {}): CalcLineInput => ({
  quantity: qty,
  unitPrice: price,
  discountKind: 'none',
  discountValue: '0',
  taxExempt: false,
  taxes: [],
  ...extra,
});
const opts = (extra: Partial<CalcOptions> = {}): CalcOptions => ({
  ...DEFAULT_CALC_OPTIONS,
  ...extra,
});

check('0.1 + 0.2 is exactly 0.3', () => {
  const r = calculate([line('0.1'), line('0.2')], opts({ precision: 4 }));
  assert.equal(r.subtotal, '0.3000');
  assert.equal(r.total, '0.3000');
});

check('exclusive tax with a discount before tax: 100 - 10% = 90, tax 9, total 99', () => {
  const r = calculate([
    line('100', '1', { discountKind: 'percent', discountValue: '10', taxes: [vat('10')] }),
  ]);
  assert.equal(r.lines[0]?.net, '90.0000');
  assert.equal(r.taxTotal, '9.0000');
  assert.equal(r.total, '99.0000');
});

check('discount after tax: tax on 100 is 10, discount 10 lowers the total to 100', () => {
  const r = calculate(
    [line('100', '1', { discountKind: 'percent', discountValue: '10', taxes: [vat('10')] })],
    opts({ discountOrder: 'after_tax' }),
  );
  assert.equal(r.taxTotal, '10.0000');
  assert.equal(r.total, '100.0000');
});

check('inclusive price 110 with 10% tax is 100 net and 10 tax', () => {
  const r = calculate([line('110', '1', { taxes: [vat('10')] })], opts({ priceMode: 'inclusive' }));
  assert.equal(r.subtotal, '100.0000');
  assert.equal(r.taxTotal, '10.0000');
  assert.equal(r.total, '110.0000');
});

check('inclusive price 100 with 7.25% + 2% tax adds up to exactly 100', () => {
  const r = calculate(
    [line('100', '1', { taxes: [vat('7.25', false, 'STATE'), vat('2', false, 'CITY')] })],
    opts({ priceMode: 'inclusive' }),
  );
  assert.equal(r.total, '100.0000');
  assert.equal(Money.parse(r.subtotal).add(r.taxTotal).toDbString(), '100.0000');
});

check('compound tax: 5% then 10% on top is 5.00 + 10.50', () => {
  const r = calculate([line('100', '1', { taxes: [vat('5', false, 'A'), vat('10', true, 'B')] })]);
  assert.equal(r.lines[0]?.taxes[0]?.amount, '5.0000');
  assert.equal(r.lines[0]?.taxes[1]?.amount, '10.5000');
  assert.equal(r.total, '115.5000');
  assert.equal(taxMultiplier([vat('5', false, 'A'), vat('10', true, 'B')]), '1.155000000000');
});

check("rounding: per line, on the total, and banker's", () => {
  const three = [line('1.005'), line('1.005'), line('1.005')];
  assert.equal(calculate(three, opts({ roundingPolicy: 'per_line' })).total, '3.0300');
  const onTotal = calculate(three, opts({ roundingPolicy: 'on_total' }));
  assert.equal(onTotal.total, '3.0200');
  assert.equal(onTotal.roundingDifference, '0.0100');
  assert.equal(
    calculate(three, opts({ roundingPolicy: 'per_line', roundingMode: 'half_even' })).total,
    '3.0000',
  );
  assert.equal(roundMoney(Money.parse('2.5'), 0, 'half_even').toDbString(), '2.0000');
  assert.equal(roundMoney(Money.parse('3.5'), 0, 'half_even').toDbString(), '4.0000');
  assert.equal(roundMoney(Money.parse('-1.005'), 2, 'half_up').toDbString(), '-1.0100');
  assert.equal(roundMoney(Money.parse('1.0049'), 2, 'half_up').toDbString(), '1.0000');
});

check('document discount is shared exactly over the lines', () => {
  const r = calculate(
    [line('33.33'), line('33.33'), line('33.34')],
    opts({ documentDiscountKind: 'fixed', documentDiscountValue: '10' }),
  );
  const sum = r.lines.reduce((a, l) => a.add(l.documentDiscountShare), Money.zero());
  assert.equal(sum.toDbString(), '10.0000');
  assert.equal(r.documentDiscount, '10.0000');
  assert.equal(r.total, '90.0000');
  assert.equal(r.netTotal, '90.0000');
});

check('document discount in percent lowers tax too', () => {
  const r = calculate(
    [line('200', '1', { taxes: [vat('10')] })],
    opts({ documentDiscountKind: 'percent', documentDiscountValue: '25' }),
  );
  assert.equal(r.documentDiscount, '50.0000');
  assert.equal(r.taxTotal, '15.0000');
  assert.equal(r.total, '165.0000');
});

check('shipping: not taxable and taxable', () => {
  assert.equal(calculate([line('100')], opts({ shippingAmount: '20' })).total, '120.0000');
  const r = calculate(
    [line('100')],
    opts({ shippingAmount: '20', shippingTaxable: true, shippingTaxes: [vat('10')] }),
  );
  assert.equal(r.shippingTax, '2.0000');
  assert.equal(r.total, '122.0000');
  assert.equal(r.taxBreakdown[0]?.base, '20.0000');
});

check('withholding tax lowers what is due, not the total', () => {
  const r = calculate([line('1000', '1', { taxes: [vat('10')] })], opts({ withholdingRate: '5' }));
  assert.equal(r.total, '1100.0000');
  assert.equal(r.withholding, '50.0000');
  assert.equal(r.amountDue, '1050.0000');
});

check('cash rounding to the nearest 0.05 and to 1', () => {
  const r = calculate([line('10.03')], opts({ cashRounding: '0.05' }));
  assert.equal(r.roundingAdjustment, '0.0200');
  assert.equal(r.amountDue, '10.0500');
  const down = calculate([line('10.02')], opts({ cashRounding: '0.05' }));
  assert.equal(down.roundingAdjustment, '-0.0200');
  assert.equal(calculate([line('10.4')], opts({ cashRounding: '1' })).amountDue, '10.0000');
});

check('negative lines, fixed discount and zero invoices', () => {
  const r = calculate([line('100'), line('-25')]);
  assert.equal(r.total, '75.0000');
  const fixed = calculate([line('-40', '1', { discountKind: 'fixed', discountValue: '100' })]);
  assert.equal(
    fixed.lines[0]?.lineDiscount,
    '-40.0000',
    'a fixed discount cannot turn a line around',
  );
  const zero = calculate([line('0'), line('5', '0', { taxes: [vat('10')] })]);
  assert.equal(zero.total, '0.0000');
  assert.equal(zero.amountDue, '0.0000');
  assert.equal(calculate([]).total, '0.0000');
});

check('tax exempt line and rate-wise breakdown', () => {
  const r = calculate([
    line('100', '1', { taxes: [vat('10')] }),
    line('50', '1', { taxes: [vat('10')], taxExempt: true }),
    line('200', '1', { taxes: [vat('5', false, 'GST')] }),
  ]);
  assert.equal(r.taxTotal, '20.0000');
  assert.equal(r.taxBreakdown.length, 2);
  assert.equal(r.taxBreakdown.find((x) => x.code === 'VAT')?.base, '100.0000');
  assert.equal(r.total, '370.0000');
});

check('quantity with four decimals and a large invoice', () => {
  const r = calculate([line('19.99', '2.5')]);
  assert.equal(r.total, '49.9800');
  const many = calculate(
    Array.from({ length: 1500 }, () => line('0.01', '1', { taxes: [vat('10')] })),
    opts({ roundingPolicy: 'on_total' }),
  );
  assert.equal(many.subtotal, '15.0000');
  assert.equal(many.taxTotal, '1.5000');
});

check('amount in words', () => {
  assert.equal(amountInWords(Money.parse('500')), 'Five Hundred USD Only');
  assert.equal(
    amountInWords(Money.parse('123.45')),
    'One Hundred Twenty-Three USD and Forty-Five Cents Only',
  );
  assert.equal(amountInWords(Money.parse('0')), 'Zero USD Only');
  assert.equal(amountInWords(Money.parse('1000001.01')), 'One Million One USD and One Cent Only');
  assert.equal(amountInWords(Money.parse('-12')), 'Minus Twelve USD Only');
  assert.equal(integerWords('1000000000000'), 'One Trillion');
  assert.equal(integerWords('90019'), 'Ninety Thousand Nineteen');
});

check('consistency on 2000 generated invoices: parts always add up to the total', () => {
  let seed = 12345;
  const next = (n: number): number => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed % n;
  };
  const rates = ['0', '5', '7.25', '10', '19', '20.5'];
  for (let k = 0; k < 2000; k += 1) {
    const lines: CalcLineInput[] = Array.from({ length: 1 + next(6) }, () => {
      const taxes =
        next(3) === 0
          ? []
          : [
              vat(rates[next(rates.length)] ?? '0', false, 'A'),
              ...(next(4) === 0 ? [vat('3', true, 'B')] : []),
            ];
      const kind = ['none', 'percent', 'fixed'][next(3)] as 'none' | 'percent' | 'fixed';
      return line(
        `${next(900)}.${String(next(100)).padStart(2, '0')}`,
        `${1 + next(5)}.${next(10)}`,
        {
          taxes,
          discountKind: kind,
          discountValue: kind === 'percent' ? String(next(40)) : `${next(30)}.${next(10)}`,
        },
      );
    });
    const o = opts({
      priceMode: next(2) === 0 ? 'exclusive' : 'inclusive',
      discountOrder: next(2) === 0 ? 'before_tax' : 'after_tax',
      roundingPolicy: next(2) === 0 ? 'per_line' : 'on_total',
      roundingMode: next(2) === 0 ? 'half_up' : 'half_even',
      precision: ([2, 3, 4] as const)[next(3)] ?? 2,
      documentDiscountKind: next(3) === 0 ? 'fixed' : 'none',
      documentDiscountValue: `${next(40)}.5`,
      shippingAmount: `${next(30)}.25`,
      shippingTaxable: next(2) === 0,
      shippingTaxes: [vat('8')],
    });
    const r = calculate(lines, o);
    const parts = Money.parse(r.netTotal).add(r.shipping).add(r.taxTotal);
    assert.equal(r.total, parts.toDbString(), `case ${k}: total is net + shipping + tax`);
    assert.equal(
      Money.parse(r.subtotal).sub(r.lineDiscountTotal).sub(r.documentDiscount).toDbString(),
      r.netTotal,
      `case ${k}: net is subtotal minus discounts`,
    );
    const rowSum = r.taxBreakdown.reduce((a, x) => a.add(x.amount), Money.zero());
    assert.equal(rowSum.toDbString(), r.taxTotal, `case ${k}: breakdown adds up to the tax`);
    if (o.roundingPolicy === 'per_line') {
      const lineTotals = r.lines.reduce((a, l) => a.add(l.total), Money.zero());
      assert.equal(
        lineTotals.add(r.shipping).add(r.shippingTax).toDbString(),
        r.total,
        `case ${k}: lines add up to the total`,
      );
    }
  }
});

if (failures > 0) process.exit(1);
process.stdout.write('step09-calc: ok\n');
