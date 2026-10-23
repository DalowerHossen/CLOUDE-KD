// path: scripts/verify/step15-payroll-calc.ts
// Logic checks of payroll calculation and the payroll input rules (15.8.a) that need no database: gross pay for monthly, hourly and
// commission staff, overtime and its cap, components, pro rata pay, pay frequency, income tax by bracket and flat contributions with
// caps and thresholds, rounding, net pay, and the strict inputs and the employee CSV import. The numbers, the employee number and
// the same-company rules are in sql/assertions/s15_010_payroll_people.sql.
// Run: SKIP_ENV_VALIDATION=1 npx tsx --conditions=react-server scripts/verify/step15-payroll-calc.ts
import assert from 'node:assert/strict';
import { Money } from '@/lib/utils/currency';
import {
  calculatePay,
  proration,
  roundBy,
  type CompItem,
  type PayInput,
  type PayResult,
} from '@/services/payroll/calc-rules';
import {
  bankInfo,
  bracketsFromText,
  checkBrackets,
  componentInput,
  employeeInput,
  employeeUpdate,
  gradeInput,
  parseEmployeesCsv,
  payInfo,
  settingsInput,
  taxInfo,
  taxRuleInput,
} from '@/services/payroll/payroll-rules';
import { bracketTax, computeTaxes, type TaxRule } from '@/services/payroll/tax-calc-rules';

let checks = 0;
const check = (name: string, fn: () => void): void => {
  try {
    fn();
    checks += 1;
  } catch (error) {
    process.stderr.write(`FAIL ${name}\n`);
    throw error;
  }
};

const rule = (over: Partial<TaxRule>): TaxRule => ({
  code: 'T',
  name: 'Tax',
  kind: 'income_tax',
  method: 'flat',
  rate: '10',
  appliesTo: 'taxable',
  wageCapAnnual: null,
  extraThresholdAnnual: null,
  extraRate: '0',
  exemptionAnnual: '0',
  brackets: [],
  ...over,
});
const base = (over: Partial<PayInput> = {}): PayInput => ({
  basis: 'monthly',
  baseAmount: '5000',
  commissionRatePercent: '0',
  period: { start: '2026-04-01', end: '2026-04-30', periodsPerYear: 12 },
  joinDate: '2020-01-01',
  endDate: null,
  regularHours: '0',
  overtimeHours: '0',
  sales: '0',
  bonus: '0',
  incentive: '0',
  items: [],
  settings: {
    overtimeMultiplier: '1.5',
    overtimeCapHours: null,
    standardHoursPerMonth: '160',
    rounding: 'cent',
  },
  taxRules: [],
  ytd: { taxable: '0', gross: '0' },
  ...over,
});
const item = (over: Partial<CompItem>): CompItem => ({
  code: 'X',
  name: 'X',
  kind: 'earning',
  calcType: 'fixed',
  value: '0',
  taxable: true,
  preTax: false,
  ...over,
});
const sumLines = (r: PayResult, kind: string): string =>
  Money.sum(r.lines.filter((l) => l.kind === kind).map((l) => Money.parse(l.amount))).toDbString();

check('monthly salary without anything else', () => {
  const r = calculatePay(base());
  assert.equal(r.gross, '5000.0000');
  assert.equal(r.net, '5000.0000');
  assert.equal(r.employerCost, '5000.0000');
  assert.deepEqual(r.warnings, []);
});

check('components, deductions before and after tax, a tax and an employer contribution', () => {
  const r = calculatePay(
    base({
      items: [
        item({ code: 'HRA', name: 'Housing', calcType: 'percent_of_basic', value: '20' }),
        item({ code: 'TRN', name: 'Transport', value: '100', taxable: false }),
        item({ code: 'MED', name: 'Medical', kind: 'deduction', value: '50', preTax: true }),
        item({ code: 'LOAN', name: 'Loan', kind: 'deduction', value: '100' }),
      ],
      taxRules: [
        rule({ code: 'INC', rate: '10' }),
        rule({ code: 'ER', kind: 'employer_contribution', appliesTo: 'gross', rate: '5' }),
      ],
    }),
  );
  assert.equal(r.gross, '6100.0000');
  assert.equal(r.taxableIncome, '5950.0000');
  assert.equal(r.employeeTaxes, '595.0000');
  assert.equal(r.employerContributions, '305.0000');
  assert.equal(r.net, '5355.0000');
  assert.equal(r.employerCost, '6405.0000');
});

check('the lines add up to the totals', () => {
  const r = calculatePay(
    base({
      baseAmount: '4321.37',
      items: [
        item({ code: 'A', calcType: 'percent_of_basic', value: '7.5' }),
        item({ code: 'D', kind: 'deduction', calcType: 'percent_of_gross', value: '3.3' }),
      ],
      taxRules: [rule({ rate: '12.5' })],
      bonus: '100.55',
    }),
  );
  assert.equal(sumLines(r, 'earning'), r.gross);
  assert.equal(
    Money.parse(r.gross).sub(sumLines(r, 'deduction')).sub(sumLines(r, 'tax')).toDbString(),
    r.net,
  );
});

check('pro rata for someone who joins or leaves in the period', () => {
  assert.equal(calculatePay(base({ joinDate: '2026-04-16' })).basic, '2500.0000');
  assert.equal(calculatePay(base({ endDate: '2026-04-10' })).basic, '1666.6700');
  const none = calculatePay(base({ joinDate: '2026-05-01' }));
  assert.equal(none.gross, '0.0000');
  assert.match(none.warnings.join(' '), /not employed/);
  const p = proration(
    { start: '2026-04-01', end: '2026-04-30', periodsPerYear: 12 },
    '2026-04-16',
    null,
  );
  assert.equal(p.daysPaid, 15);
  assert.equal(p.daysInPeriod, 30);
});

check('hourly pay, overtime and the overtime limit', () => {
  const hourly = calculatePay(
    base({ basis: 'hourly', baseAmount: '20', regularHours: '160', overtimeHours: '10' }),
  );
  assert.equal(hourly.basic, '3200.0000');
  assert.equal(hourly.overtime, '300.0000');
  assert.equal(hourly.gross, '3500.0000');
  const capped = calculatePay(
    base({
      basis: 'hourly',
      baseAmount: '20',
      regularHours: '160',
      overtimeHours: '10',
      settings: {
        overtimeMultiplier: '1.5',
        overtimeCapHours: '6',
        standardHoursPerMonth: '160',
        rounding: 'cent',
      },
    }),
  );
  assert.equal(capped.overtime, '180.0000');
  assert.equal(capped.overtimeHoursCapped, '4.0000');
  assert.match(capped.warnings.join(' '), /capped at 6/);
  const salaried = calculatePay(base({ baseAmount: '3200', overtimeHours: '10' }));
  assert.equal(salaried.overtime, '300.0000');
  assert.equal(calculatePay(base({ overtimeHours: '0' })).overtime, '0.0000');
});

check('commission staff: base salary plus a percent of sales', () => {
  const r = calculatePay(
    base({ basis: 'commission', baseAmount: '2000', sales: '50000', commissionRatePercent: '4' }),
  );
  assert.equal(r.gross, '4000.0000');
  assert.ok(r.lines.some((l) => l.code === 'COMMISSION' && l.amount === '2000.0000'));
});

check('pay frequency scales monthly amounts', () => {
  const semi = calculatePay(
    base({ period: { start: '2026-04-01', end: '2026-04-15', periodsPerYear: 24 } }),
  );
  assert.equal(semi.basic, '2500.0000');
  const bi = calculatePay(
    base({ period: { start: '2026-04-01', end: '2026-04-14', periodsPerYear: 26 } }),
  );
  assert.equal(bi.basic, '2307.6900');
  const week = calculatePay(
    base({
      period: { start: '2026-04-06', end: '2026-04-12', periodsPerYear: 52 },
      baseAmount: '5200',
    }),
  );
  assert.equal(week.basic, '1200.0000');
});

check('bracket income tax on the annualised pay, with an exemption', () => {
  const brackets = [
    { lowerAnnual: '0', rate: '10' },
    { lowerAnnual: '10000', rate: '20' },
  ];
  assert.equal(bracketTax(Money.parse('5000'), brackets).toDbString(), '500.0000');
  assert.equal(bracketTax(Money.parse('30000'), brackets).toDbString(), '5000.0000');
  assert.equal(bracketTax(Money.zero(), brackets).toDbString(), '0.0000');
  const r = calculatePay(
    base({ baseAmount: '2500', taxRules: [rule({ method: 'bracket', brackets })] }),
  );
  assert.equal(r.employeeTaxes, '416.6700');
  const ex = calculatePay(
    base({
      baseAmount: '2500',
      taxRules: [rule({ method: 'bracket', brackets, exemptionAnnual: '10000' })],
    }),
  );
  assert.equal(ex.employeeTaxes, '250.0000');
  const below = calculatePay(
    base({
      baseAmount: '500',
      taxRules: [rule({ method: 'bracket', brackets, exemptionAnnual: '10000' })],
    }),
  );
  assert.equal(below.employeeTaxes, '0.0000');
});

check('a yearly wage cap stops a contribution, an extra rate starts above a threshold', () => {
  const ss = rule({
    code: 'SS',
    kind: 'employee_contribution',
    appliesTo: 'gross',
    rate: '6.2',
    wageCapAnnual: '168600',
  });
  const near = computeTaxes(
    [ss],
    Money.parse('5000'),
    Money.parse('5000'),
    { taxable: '0', gross: '168000' },
    12,
  );
  assert.equal(near[0]?.amount, '37.2000');
  const over = computeTaxes(
    [ss],
    Money.parse('5000'),
    Money.parse('5000'),
    { taxable: '0', gross: '170000' },
    12,
  );
  assert.equal(over[0]?.amount, '0.0000');
  const free = computeTaxes(
    [ss],
    Money.parse('5000'),
    Money.parse('5000'),
    { taxable: '0', gross: '0' },
    12,
  );
  assert.equal(free[0]?.amount, '310.0000');
  const med = rule({
    code: 'MED',
    kind: 'employee_contribution',
    appliesTo: 'gross',
    rate: '1.45',
    extraThresholdAnnual: '200000',
    extraRate: '0.9',
  });
  const high = computeTaxes(
    [med],
    Money.parse('5000'),
    Money.parse('5000'),
    { taxable: '0', gross: '199000' },
    12,
  );
  assert.equal(high[0]?.amount, '108.5000');
  const normal = computeTaxes(
    [med],
    Money.parse('5000'),
    Money.parse('5000'),
    { taxable: '0', gross: '0' },
    12,
  );
  assert.equal(normal[0]?.amount, '72.5000');
});

check('rounding modes, half up, also for a negative amount', () => {
  assert.equal(roundBy(Money.parse('12.345'), 'cent').toDbString(), '12.3500');
  assert.equal(roundBy(Money.parse('12.344'), 'cent').toDbString(), '12.3400');
  assert.equal(roundBy(Money.parse('12.5'), 'dollar').toDbString(), '13.0000');
  assert.equal(roundBy(Money.parse('12.49'), 'dollar').toDbString(), '12.0000');
  assert.equal(roundBy(Money.parseRounded('12.34567'), 'none').toDbString(), '12.3457');
  assert.equal(roundBy(Money.parse('-12.5'), 'dollar').toDbString(), '-13.0000');
  const r = calculatePay(
    base({
      baseAmount: '1000.5',
      settings: {
        overtimeMultiplier: '1.5',
        overtimeCapHours: null,
        standardHoursPerMonth: '160',
        rounding: 'dollar',
      },
    }),
  );
  assert.equal(r.gross, '1001.0000');
});

check('deductions above the gross pay are flagged', () => {
  const r = calculatePay(
    base({ baseAmount: '100', items: [item({ code: 'D', kind: 'deduction', value: '300' })] }),
  );
  assert.equal(r.net, '-200.0000');
  assert.match(r.warnings.join(' '), /more than the gross/);
});

check(
  'inactive-free structure: percent of gross counts the earnings and a deduction never goes into gross',
  () => {
    const r = calculatePay(
      base({
        bonus: '1000',
        items: [item({ code: 'D', kind: 'deduction', calcType: 'percent_of_gross', value: '10' })],
      }),
    );
    assert.equal(r.gross, '6000.0000');
    assert.equal(r.postTaxDeductions, '600.0000');
    assert.equal(r.net, '5400.0000');
  },
);

check('employee input: required fields, no markup, strict, details kept apart', () => {
  const ok = {
    firstName: 'Ann',
    lastName: 'Lee',
    email: 'Ann@Example.com',
    joinDate: '2026-01-05',
  };
  const parsed = employeeInput.safeParse(ok);
  assert.ok(parsed.success);
  assert.equal(parsed.success ? parsed.data.email : '', 'ann@example.com');
  assert.ok(!employeeInput.safeParse({ ...ok, firstName: '<b>' }).success);
  assert.ok(!employeeInput.safeParse({ ...ok, email: 'nope' }).success);
  assert.ok(!employeeInput.safeParse({ ...ok, joinDate: '2026-02-30' }).success);
  assert.ok(!employeeInput.safeParse({ ...ok, extra: 1 }).success);
  assert.ok(!employeeInput.safeParse({ ...ok, customFields: { 'Bad Key': 'x' } }).success);
  assert.ok(payInfo.safeParse({ baseAmount: '5000' }).success);
  assert.ok(!payInfo.safeParse({ baseAmount: '-1' }).success);
  assert.ok(!payInfo.safeParse({ baseAmount: '1', commissionRatePercent: '101' }).success);
  assert.ok(
    bankInfo.safeParse({ holder: 'Ann Lee', bankName: 'Bank', accountNumber: '123456789' }).success,
  );
  assert.ok(
    !bankInfo.safeParse({ holder: 'Ann Lee', bankName: 'Bank', accountNumber: '12' }).success,
  );
  assert.ok(taxInfo.safeParse({ taxId: 'AB-123456' }).success);
  assert.ok(!taxInfo.safeParse({ taxId: '<x>' }).success);
  assert.ok(
    employeeUpdate.safeParse({ version: 1, status: 'terminated', endDate: '2026-06-30' }).success,
  );
  assert.ok(!employeeUpdate.safeParse({ status: 'active' }).success);
});

check('employee CSV import: bad rows by line, repeated email, columns by name', () => {
  const csv = [
    'First name,Last name,Email,Join date,Department,Contract type',
    'Ann,Lee,ann@example.com,2026-01-05,Sales,Full time',
    'Bob,Ray,bad-email,2026-01-05,,',
    'Cy,Day,ann@example.com,2026-01-05,,',
    'Di,Fox,di@example.com,2026-13-05,,',
    'Ed,Kim,ed@example.com,2026-02-01,Ops,part-time',
  ].join('\n');
  const r = parseEmployeesCsv(csv);
  assert.equal(r.rows.length, 2);
  assert.deepEqual(
    r.errors.map((e) => e.line),
    [3, 4, 5],
  );
  assert.equal(r.rows[1]?.input.contractType, 'part_time');
  assert.equal(parseEmployeesCsv('a,b\n1,2').errors.length, 1);
});

check('components, grades, settings and tax rules', () => {
  assert.ok(
    componentInput.safeParse({
      code: 'hra',
      name: 'Housing',
      kind: 'earning',
      calcType: 'percent_of_basic',
      defaultValue: '20',
    }).success,
  );
  assert.ok(
    !componentInput.safeParse({ code: 'X', name: 'x', kind: 'earning', preTax: true }).success,
  );
  assert.ok(
    !componentInput.safeParse({
      code: 'X',
      name: 'x',
      kind: 'earning',
      calcType: 'percent_of_gross',
    }).success,
  );
  assert.ok(
    !componentInput.safeParse({
      code: 'X',
      name: 'x',
      kind: 'earning',
      calcType: 'percent_of_basic',
      defaultValue: '150',
    }).success,
  );
  assert.ok(!componentInput.safeParse({ code: 'bad code', name: 'x', kind: 'earning' }).success);
  assert.ok(gradeInput.safeParse({ name: 'A', minAmount: '1000', maxAmount: '3000' }).success);
  assert.ok(!gradeInput.safeParse({ name: 'A', minAmount: '3000', maxAmount: '1000' }).success);
  const s = {
    payFrequency: 'monthly',
    overtimeMultiplier: '1.5',
    overtimeCapHours: null,
    standardHoursPerMonth: '160',
    rounding: 'cent',
  };
  assert.ok(settingsInput.safeParse(s).success);
  assert.ok(!settingsInput.safeParse({ ...s, overtimeMultiplier: '0.5' }).success);
  assert.ok(!settingsInput.safeParse({ ...s, payFrequency: 'daily' }).success);
  const flat = {
    code: 'ss',
    name: 'Social security',
    kind: 'employee_contribution',
    method: 'flat',
    rate: '6.2',
    wageCapAnnual: '168600',
  };
  assert.ok(taxRuleInput.safeParse(flat).success);
  const bracket = {
    code: 'inc',
    name: 'Income tax',
    kind: 'income_tax',
    method: 'bracket',
    brackets: '0:10; 11000:12; 44725:22',
  };
  const parsed = taxRuleInput.safeParse(bracket);
  assert.ok(parsed.success);
  assert.equal(parsed.success ? parsed.data.brackets.length : 0, 3);
  assert.ok(!taxRuleInput.safeParse({ ...bracket, brackets: '' }).success);
  assert.ok(!taxRuleInput.safeParse({ ...bracket, brackets: '5:10' }).success);
  assert.ok(!taxRuleInput.safeParse({ ...bracket, brackets: '0:10; 0:12' }).success);
  assert.ok(!taxRuleInput.safeParse({ ...bracket, wageCapAnnual: '1000' }).success);
  assert.ok(!taxRuleInput.safeParse({ ...flat, brackets: '0:10' }).success);
  assert.equal(
    checkBrackets([
      { lowerAnnual: '0', rate: '1' },
      { lowerAnnual: '10', rate: '2' },
    ]),
    null,
  );
  assert.deepEqual(bracketsFromText('0:10;11000:12'), [
    { lowerAnnual: '0', rate: '10' },
    { lowerAnnual: '11000', rate: '12' },
  ]);
  assert.equal(bracketsFromText(undefined), undefined);
});

process.stdout.write(`step15-payroll-calc: ${checks} checks passed\n`);
