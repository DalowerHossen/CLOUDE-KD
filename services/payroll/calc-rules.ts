// path: services/payroll/calc-rules.ts
// Pay calculation as pure functions: gross pay for monthly, hourly and commission staff (with overtime, components, bonus and
// incentive), pro rata pay for someone who joins or leaves mid period, deductions before and after tax, the tax rules, rounding,
// and net pay. Fixed component and salary amounts are per month and are scaled to the pay frequency. Every line is rounded
// before it is added, so the lines of a payslip add up exactly to its totals. No database here.
import { Money } from '@/lib/utils/currency';
import { computeTaxes, type TaxLine, type TaxRule, type Ytd } from './tax-calc-rules';

export type PayBasis = 'monthly' | 'hourly' | 'commission';
export type Rounding = 'none' | 'cent' | 'dollar';

export interface CompItem {
  code: string;
  name: string;
  kind: 'earning' | 'deduction';
  calcType: 'fixed' | 'percent_of_basic' | 'percent_of_gross';
  value: string;
  taxable: boolean;
  preTax: boolean;
}

export interface PayPeriod {
  start: string;
  end: string;
  periodsPerYear: 12 | 24 | 26 | 52;
}

export interface PaySettings {
  overtimeMultiplier: string;
  overtimeCapHours: string | null;
  standardHoursPerMonth: string;
  rounding: Rounding;
}

export interface PayInput {
  basis: PayBasis;
  /** Monthly salary, hourly rate, or the base salary of a commission employee (per month). */
  baseAmount: string;
  commissionRatePercent: string;
  period: PayPeriod;
  joinDate: string;
  endDate: string | null;
  regularHours: string;
  overtimeHours: string;
  sales: string;
  bonus: string;
  incentive: string;
  items: readonly CompItem[];
  settings: PaySettings;
  taxRules: readonly TaxRule[];
  ytd: Ytd;
}

export interface PayLine {
  code: string;
  name: string;
  kind: 'earning' | 'deduction' | 'tax' | 'employer';
  amount: string;
}

export interface PayResult {
  lines: PayLine[];
  basic: string;
  overtime: string;
  gross: string;
  taxableIncome: string;
  preTaxDeductions: string;
  postTaxDeductions: string;
  employeeTaxes: string;
  employerContributions: string;
  net: string;
  employerCost: string;
  proration: { daysPaid: number; daysInPeriod: number; factor: string };
  overtimeHoursPaid: string;
  overtimeHoursCapped: string;
  warnings: string[];
}

const DAY = 86_400_000;
const days = (from: string, to: string): number =>
  (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY + 1;

/** Rounds an amount by the company's rule: none keeps four places, cent two places, dollar a whole dollar (half up). */
export function roundBy(value: Money, mode: Rounding): Money {
  if (mode === 'none') return value;
  const { negative, integer, fraction } = value.toParts(mode === 'cent' ? 2 : 0);
  return Money.parse(`${negative ? '-' : ''}${integer}${fraction ? `.${fraction}` : ''}`);
}

/** Days of the period the person was employed, and that share of the period (1 for a full period). */
export function proration(
  period: PayPeriod,
  joinDate: string,
  endDate: string | null,
): { daysPaid: number; daysInPeriod: number; factor: Money } {
  const total = days(period.start, period.end);
  const from = joinDate > period.start ? joinDate : period.start;
  const to = endDate !== null && endDate < period.end ? endDate : period.end;
  const paid = to < from ? 0 : days(from, to);
  return {
    daysPaid: paid,
    daysInPeriod: total,
    factor: Money.parse(String(paid)).div(String(total)),
  };
}

/** Per month amount to the amount for one pay period. */
const perPeriod = (monthly: Money, periodsPerYear: number): Money =>
  monthly.mul('12').div(String(periodsPerYear));

export function calculatePay(i: PayInput): PayResult {
  const warnings: string[] = [];
  const lines: PayLine[] = [];
  const round = (v: Money): Money => roundBy(v, i.settings.rounding);
  const pr = proration(i.period, i.joinDate, i.endDate);
  if (pr.daysPaid === 0) warnings.push('The person was not employed in this period.');
  const factor = pr.factor;
  /** The share of the period worked, by days paid over days in the period (multiplied first, so no cent is lost). */
  const prorate = (amount: Money): Money =>
    amount.mul(String(pr.daysPaid)).div(String(pr.daysInPeriod));
  const push = (code: string, name: string, kind: PayLine['kind'], amount: Money): Money => {
    const r = round(amount);
    lines.push({ code, name, kind, amount: r.toDbString() });
    return r;
  };
  const standard = Money.parse(i.settings.standardHoursPerMonth);
  const base = Money.parse(i.baseAmount);
  const hourlyRate = i.basis === 'hourly' ? base : base.div(standard.toDbString());

  let basic: Money;
  if (i.basis === 'hourly') basic = base.mul(i.regularHours);
  else basic = prorate(perPeriod(base, i.period.periodsPerYear));
  const basicRounded = push(
    'BASIC',
    i.basis === 'hourly' ? 'Hours worked' : 'Basic pay',
    'earning',
    basic,
  );

  let commission = Money.zero();
  if (i.basis === 'commission') {
    commission = push(
      'COMMISSION',
      'Commission',
      'earning',
      Money.parse(i.sales).mul(i.commissionRatePercent).div('100'),
    );
  }

  let otHours = Money.parse(i.overtimeHours);
  let capped = Money.zero();
  if (i.settings.overtimeCapHours !== null && otHours.gt(i.settings.overtimeCapHours)) {
    capped = otHours.sub(i.settings.overtimeCapHours);
    otHours = Money.parse(i.settings.overtimeCapHours);
    warnings.push(
      `Overtime is capped at ${i.settings.overtimeCapHours} hours; ${capped.toDbString()} hours were not paid.`,
    );
  }
  const overtime = otHours.isPositive()
    ? push(
        'OVERTIME',
        'Overtime',
        'earning',
        hourlyRate.mul(i.settings.overtimeMultiplier).mul(otHours.toDbString()),
      )
    : Money.zero();

  const scale = (item: CompItem): Money =>
    perPeriod(Money.parse(item.value), i.period.periodsPerYear).mul(factor.toDbString());
  let earnings = Money.zero();
  let nonTaxable = Money.zero();
  for (const c of i.items.filter((x) => x.kind === 'earning')) {
    const amount = c.calcType === 'fixed' ? scale(c) : basicRounded.mul(c.value).div('100');
    const r = push(c.code, c.name, 'earning', amount);
    earnings = earnings.add(r);
    if (!c.taxable) nonTaxable = nonTaxable.add(r);
  }
  const bonus = Money.parse(i.bonus).isPositive()
    ? push('BONUS', 'Bonus', 'earning', Money.parse(i.bonus))
    : Money.zero();
  const incentive = Money.parse(i.incentive).isPositive()
    ? push('INCENTIVE', 'Incentive', 'earning', Money.parse(i.incentive))
    : Money.zero();
  const gross = basicRounded.add(commission).add(overtime).add(earnings).add(bonus).add(incentive);

  let preTax = Money.zero();
  let postTax = Money.zero();
  for (const c of i.items.filter((x) => x.kind === 'deduction')) {
    const amount =
      c.calcType === 'fixed'
        ? scale(c)
        : (c.calcType === 'percent_of_gross' ? gross : basicRounded).mul(c.value).div('100');
    const r = push(c.code, c.name, 'deduction', amount);
    if (c.preTax) preTax = preTax.add(r);
    else postTax = postTax.add(r);
  }
  const taxable = Money.max(gross.sub(nonTaxable).sub(preTax), Money.zero());
  const taxLines: TaxLine[] = computeTaxes(
    i.taxRules,
    taxable,
    gross,
    i.ytd,
    i.period.periodsPerYear,
  );
  let employeeTaxes = Money.zero();
  let employer = Money.zero();
  for (const t of taxLines) {
    if (t.kind === 'employer_contribution') {
      employer = employer.add(push(t.code, t.name, 'employer', Money.parse(t.amount)));
    } else {
      employeeTaxes = employeeTaxes.add(push(t.code, t.name, 'tax', Money.parse(t.amount)));
    }
  }
  const net = gross.sub(preTax).sub(postTax).sub(employeeTaxes);
  if (net.isNegative()) warnings.push('The deductions and taxes are more than the gross pay.');
  return {
    lines,
    basic: basicRounded.toDbString(),
    overtime: overtime.toDbString(),
    gross: gross.toDbString(),
    taxableIncome: taxable.toDbString(),
    preTaxDeductions: preTax.toDbString(),
    postTaxDeductions: postTax.toDbString(),
    employeeTaxes: employeeTaxes.toDbString(),
    employerContributions: employer.toDbString(),
    net: net.toDbString(),
    employerCost: gross.add(employer).toDbString(),
    proration: {
      daysPaid: pr.daysPaid,
      daysInPeriod: pr.daysInPeriod,
      factor: factor.toDbString(),
    },
    overtimeHoursPaid: otHours.toDbString(),
    overtimeHoursCapped: capped.toDbString(),
    warnings,
  };
}
