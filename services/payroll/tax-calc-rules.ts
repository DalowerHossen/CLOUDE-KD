// path: services/payroll/tax-calc-rules.ts
// Payroll tax as pure functions. The platform ships no jurisdiction rates: the owner configures rules. A rule is flat (a rate on
// wages, with an optional yearly wage cap and an extra rate above a yearly threshold, as social security and medicare are built) or
// bracket (annual brackets applied to the annualised taxable pay after an exemption). Caps and thresholds work on the year to
// date, so a contribution stops when the cap is reached and starts again next year.
import { Money } from '@/lib/utils/currency';

export type TaxKind = 'income_tax' | 'employee_contribution' | 'employer_contribution';

export interface Bracket {
  lowerAnnual: string;
  rate: string;
}

export interface TaxRule {
  code: string;
  name: string;
  kind: TaxKind;
  method: 'flat' | 'bracket';
  rate: string;
  appliesTo: 'taxable' | 'gross';
  wageCapAnnual: string | null;
  extraThresholdAnnual: string | null;
  extraRate: string;
  exemptionAnnual: string;
  brackets: Bracket[];
}

export interface Ytd {
  /** Taxable pay and gross pay earlier in the year (before this period). */
  taxable: string;
  gross: string;
}

export interface TaxLine {
  code: string;
  name: string;
  kind: TaxKind;
  base: string;
  amount: string;
}

/** Marginal tax on an annual amount: each bracket's rate applies to the part of the amount above its lower bound and below the next. */
export function bracketTax(annual: Money, brackets: readonly Bracket[]): Money {
  const sorted = [...brackets].sort((a, b) => Money.parse(a.lowerAnnual).cmp(b.lowerAnnual));
  let tax = Money.zero();
  sorted.forEach((b, i) => {
    const lower = Money.parse(b.lowerAnnual);
    const next = sorted[i + 1];
    const upper = next ? Money.parse(next.lowerAnnual) : null;
    if (annual.lte(lower)) return;
    const top = upper && annual.gt(upper) ? upper : annual;
    tax = tax.add(top.sub(lower).mul(b.rate).div('100'));
  });
  return tax;
}

const above = (value: Money, line: Money): Money => Money.max(value.sub(line), Money.zero());
const within = (value: Money, cap: Money): Money => Money.min(value, cap);

/** The tax of every active rule for one pay period. `periodsPerYear` is 12, 24, 26 or 52. */
export function computeTaxes(
  rules: readonly TaxRule[],
  taxablePeriod: Money,
  grossPeriod: Money,
  ytd: Ytd,
  periodsPerYear: number,
): TaxLine[] {
  const periods = String(periodsPerYear);
  const out: TaxLine[] = [];
  for (const r of rules) {
    const period = r.appliesTo === 'gross' ? grossPeriod : taxablePeriod;
    const before = Money.parse(r.appliesTo === 'gross' ? ytd.gross : ytd.taxable);
    let amount: Money;
    if (r.method === 'bracket') {
      const annual = Money.max(period.mul(periods).sub(r.exemptionAnnual), Money.zero());
      amount = bracketTax(annual, r.brackets).div(periods);
    } else {
      const after = before.add(period);
      const basePart = r.wageCapAnnual
        ? within(after, Money.parse(r.wageCapAnnual)).sub(
            within(before, Money.parse(r.wageCapAnnual)),
          )
        : period;
      amount = Money.max(basePart, Money.zero()).mul(r.rate).div('100');
      if (r.extraThresholdAnnual && Money.parse(r.extraRate).isPositive()) {
        const thr = Money.parse(r.extraThresholdAnnual);
        amount = amount.add(above(after, thr).sub(above(before, thr)).mul(r.extraRate).div('100'));
      }
    }
    out.push({
      code: r.code,
      name: r.name,
      kind: r.kind,
      base: period.toDbString(),
      amount: amount.toDbString(),
    });
  }
  return out;
}
