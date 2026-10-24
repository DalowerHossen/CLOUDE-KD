// path: scripts/verify/step15-payroll-runs.ts
// Logic checks of pay runs (15.8.b) that need no database: the period against the pay frequency, the year to date from earlier
// runs, a whole run for several employees (totals equal the sum of the payslips, net is gross less taxes and deductions), the two
// events and the journal entries that accounting makes from them, the bank transfer list, the payslip data (the PDF needs a running app and is not drawn here), and the
// payroll reports. The status moves, the duplicate guard and the frozen figures are in sql/assertions/s15_011_pay_runs.sql.
// Run: SKIP_ENV_VALIDATION=1 npx tsx --conditions=react-server scripts/verify/step15-payroll-runs.ts
import assert from 'node:assert/strict';
import { Money } from '@/lib/utils/currency';
import { planEntry } from '@/services/accounting/posting-rules';
import { calculatePay, type PayInput, type PayLine } from '@/services/payroll/calc-rules';
import {
  annualReport,
  quarterlyTaxReport,
  registerReport,
  summaryReport,
  taxByEmployeeReport,
  type ItemRow,
  type RunRow,
} from '@/services/payroll/report-rules';
import {
  approvedPayload,
  decideInput,
  deductionsOf,
  itemInput,
  paidPayload,
  payInput,
  payslipOf,
  periodProblem,
  runInput,
  totalsOf,
  transferFile,
  ytdOf,
} from '@/services/payroll/run-rules';
import type { TaxRule } from '@/services/payroll/tax-calc-rules';

let checks = 0;
const check = (name: string, fn: () => void | Promise<void>): Promise<void> => {
  const done = (): void => {
    checks += 1;
  };
  try {
    const r = fn();
    if (r instanceof Promise)
      return r.then(done, (error: unknown) => {
        process.stderr.write(`FAIL ${name}\n`);
        throw error;
      });
    done();
  } catch (error) {
    process.stderr.write(`FAIL ${name}\n`);
    throw error;
  }
  return Promise.resolve();
};
const U = '11111111-1111-4111-8111-111111111111';

const income: TaxRule = {
  code: 'INC',
  name: 'Income tax',
  kind: 'income_tax',
  method: 'flat',
  rate: '10',
  appliesTo: 'taxable',
  wageCapAnnual: null,
  extraThresholdAnnual: null,
  extraRate: '0',
  exemptionAnnual: '0',
  brackets: [],
};
const social: TaxRule = {
  ...income,
  code: 'SS',
  name: 'Social security',
  kind: 'employee_contribution',
  appliesTo: 'gross',
  rate: '6.2',
};
const employer: TaxRule = {
  ...income,
  code: 'ER',
  name: 'Employer social',
  kind: 'employer_contribution',
  appliesTo: 'gross',
  rate: '7.65',
};
const input = (over: Partial<PayInput>): PayInput => ({
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
  taxRules: [income, social, employer],
  ytd: { taxable: '0', gross: '0' },
  ...over,
});

const main = async (): Promise<void> => {
  await check('the period must fit the pay frequency', () => {
    assert.equal(periodProblem('monthly', '2026-04-01', '2026-04-30'), null);
    assert.equal(periodProblem('monthly', '2026-02-01', '2026-02-28'), null);
    assert.match(periodProblem('monthly', '2026-04-01', '2026-04-15') ?? '', /one month/);
    assert.equal(periodProblem('weekly', '2026-04-06', '2026-04-12'), null);
    assert.match(periodProblem('weekly', '2026-04-06', '2026-04-13') ?? '', /7 days/);
    assert.equal(periodProblem('biweekly', '2026-04-06', '2026-04-19'), null);
    assert.equal(periodProblem('semimonthly', '2026-04-01', '2026-04-15'), null);
    assert.equal(periodProblem('semimonthly', '2026-04-16', '2026-04-30'), null);
    assert.match(periodProblem('semimonthly', '2026-04-01', '2026-04-30') ?? '', /half a month/);
  });

  await check('year to date: earlier runs of the same year, this employee only', () => {
    const prior = [
      { employeeId: 'a', periodEnd: '2026-01-31', gross: '5000', taxable: '4500' },
      { employeeId: 'a', periodEnd: '2026-03-31', gross: '5000', taxable: '4500' },
      { employeeId: 'a', periodEnd: '2025-12-31', gross: '9999', taxable: '9999' },
      { employeeId: 'b', periodEnd: '2026-03-31', gross: '1000', taxable: '900' },
      { employeeId: 'a', periodEnd: '2026-04-30', gross: '5000', taxable: '4500' },
    ];
    assert.deepEqual(ytdOf(prior, 'a', '2026-04-30'), {
      taxable: '9000.0000',
      gross: '10000.0000',
    });
    assert.deepEqual(ytdOf(prior, 'c', '2026-04-30'), { taxable: '0.0000', gross: '0.0000' });
  });

  await check('a whole run: totals equal the sum of the payslips', () => {
    const people = [
      calculatePay(input({})),
      calculatePay(
        input({ basis: 'hourly', baseAmount: '20', regularHours: '160', overtimeHours: '8' }),
      ),
      calculatePay(
        input({
          basis: 'commission',
          baseAmount: '2000',
          sales: '30000',
          commissionRatePercent: '4',
          joinDate: '2026-04-11',
        }),
      ),
    ];
    const figures = people.map((p) => ({
      gross: p.gross,
      taxable: p.taxableIncome,
      employeeTaxes: p.employeeTaxes,
      deductions: deductionsOf(p.preTaxDeductions, p.postTaxDeductions),
      net: p.net,
      employerContributions: p.employerContributions,
      employerCost: p.employerCost,
    }));
    const t = totalsOf(figures);
    assert.equal(t.employeeCount, 3);
    assert.equal(t.gross, Money.sum(people.map((p) => Money.parse(p.gross))).toDbString());
    assert.equal(t.net, Money.sum(people.map((p) => Money.parse(p.net))).toDbString());
    assert.equal(Money.parse(t.gross).sub(t.deductions).sub(t.employeeTaxes).toDbString(), t.net);
    assert.equal(Money.parse(t.gross).add(t.employerContributions).toDbString(), t.employerCost);
    for (const p of people)
      assert.equal(
        Money.parse(p.gross)
          .sub(p.employeeTaxes)
          .sub(p.preTaxDeductions)
          .sub(p.postTaxDeductions)
          .toDbString(),
        p.net,
      );
    assert.equal(people[0]?.employeeTaxes, '810.0000');
    assert.equal(people[0]?.employerContributions, '382.5000');
  });

  await check('the approved run becomes one balanced entry, the paid run another', () => {
    const t = totalsOf([
      {
        gross: '5000',
        taxable: '5000',
        employeeTaxes: '810',
        deductions: '0',
        net: '4190',
        employerContributions: '382.5',
        employerCost: '5382.5',
      },
    ]);
    const approved = planEntry('payroll.run_approved', approvedPayload('run1', '2026-04-30', t), {
      eventId: 'e1',
      occurredAt: '2026-05-02T10:00:00Z',
    });
    assert.equal(approved.kind, 'entry');
    if (approved.kind !== 'entry') return;
    const debit = Money.sum(
      approved.entry.lines.filter((l) => l.side === 'debit').map((l) => l.amount),
    );
    const credit = Money.sum(
      approved.entry.lines.filter((l) => l.side === 'credit').map((l) => l.amount),
    );
    assert.equal(debit.toDbString(), '5382.5000');
    assert.ok(debit.eq(credit));
    assert.equal(approved.entry.date, '2026-04-30');
    assert.equal(approved.entry.sourceKey, 'payroll:run1:approved');
    const paid = planEntry('payroll.run_paid', paidPayload('run1', '4190', '2026-05-01'), {
      eventId: 'e2',
      occurredAt: '2026-05-02T10:00:00Z',
    });
    assert.equal(paid.kind, 'entry');
    if (paid.kind !== 'entry') return;
    assert.equal(paid.entry.lines[0]?.key, 'payroll_liability');
    assert.equal(paid.entry.lines[0]?.side, 'debit');
    assert.equal(paid.entry.lines[1]?.key, 'bank');
    assert.equal(paid.entry.sourceKey, 'payroll:run1:paid');
  });

  await check('the bank transfer list: one line per employee, formulas made harmless', () => {
    const f = transferFile('PR-2026-0001', [
      {
        number: 'EMP-0001',
        holder: 'Ann Lee',
        bankName: 'First Bank',
        accountNumber: '123456789',
        routingCode: '021',
        amount: '4190.0000',
      },
      {
        number: 'EMP-0002',
        holder: '=HYPERLINK("x")',
        bankName: 'Bank',
        accountNumber: '987654321',
        routingCode: '',
        amount: '1000.5000',
      },
    ]);
    assert.equal(f.total, '5190.5000');
    const lines = f.csv.split(/\r?\n/).filter(Boolean);
    assert.equal(lines.length, 3);
    assert.ok(lines[1]?.includes('PR-2026-0001'));
    assert.ok(!lines[2]?.startsWith('EMP-0002,=') && !/,=HYPERLINK/.test(lines[2] ?? ''));
  });

  await check('the payslip data (the year to date adds this period)', () => {
    const calc = calculatePay(input({}));
    const data = payslipOf(
      'Acme Ltd',
      {
        runNumber: 'PR-2026-0001',
        periodStart: '2026-04-01',
        periodEnd: '2026-04-30',
        payDate: '2026-04-30',
      },
      {
        employeeName: 'Ann Lee',
        employeeNumber: 'EMP-0001',
        lines: calc.lines,
        gross: calc.gross,
        taxable: calc.taxableIncome,
        employeeTaxes: calc.employeeTaxes,
        deductions: '0.0000',
        net: calc.net,
        employerContributions: calc.employerContributions,
        employerCost: calc.employerCost,
      },
      { gross: '10000.0000', net: '8380.0000' },
    );
    assert.equal(data.ytdGross, '15000.0000');
    assert.equal(data.ytdNet, '12570.0000');
  });

  const lines = (...l: [string, string, PayLine['kind'], string][]): PayLine[] =>
    l.map(([code, name, kind, amount]) => ({ code, name, kind, amount }));
  const run = (id: string, n: string, end: string, pay: string): RunRow => ({
    id,
    number: n,
    periodStart: `${end.slice(0, 8)}01`,
    periodEnd: end,
    payDate: pay,
    status: 'paid',
  });
  const item = (
    runId: string,
    payDate: string,
    end: string,
    emp: string,
    num: string,
    gross: string,
    inc: string,
    ss: string,
    er: string,
  ): ItemRow => ({
    runId,
    payDate,
    periodEnd: end,
    employeeId: emp,
    number: num,
    name: `Person ${num}`,
    lines: lines(
      ['BASIC', 'Basic pay', 'earning', gross],
      ['INC', 'Income tax', 'tax', inc],
      ['SS', 'Social security', 'tax', ss],
      ['ER', 'Employer social', 'employer', er],
    ),
    gross,
    taxable: gross,
    employeeTaxes: Money.parse(inc).add(ss).toDbString(),
    deductions: '0.0000',
    net: Money.parse(gross).sub(inc).sub(ss).toDbString(),
    employerContributions: er,
    employerCost: Money.parse(gross).add(er).toDbString(),
  });
  const runs = [
    run('r1', 'PR-2026-0001', '2026-03-31', '2026-03-31'),
    run('r2', 'PR-2026-0002', '2026-04-30', '2026-04-30'),
  ];
  const items = [
    item('r1', '2026-03-31', '2026-03-31', 'a', 'EMP-0001', '5000', '500', '310', '382.5'),
    item('r1', '2026-03-31', '2026-03-31', 'b', 'EMP-0002', '3000', '300', '186', '229.5'),
    item('r2', '2026-04-30', '2026-04-30', 'a', 'EMP-0001', '5000', '500', '310', '382.5'),
  ];

  await check('payroll reports: summary, register, tax by employee, quarterly tax, annual', () => {
    const s = summaryReport(runs, items, '2026-01-01', '2026-12-31');
    assert.equal(s.rows.length, 2);
    assert.equal(s.rows[0]?.employees, '2');
    assert.equal(s.rows[0]?.gross, '8000.0000');
    assert.equal(s.totals?.gross, '13000.0000');
    const r = registerReport(items, '2026-01-01', '2026-12-31');
    assert.equal(r.rows[0]?.payslips, '2');
    assert.equal(r.rows[0]?.gross, '10000.0000');
    assert.equal(r.totals?.net, Money.sum(items.map((i) => Money.parse(i.net))).toDbString());
    const t = taxByEmployeeReport(items, '2026-01-01', '2026-12-31');
    assert.deepEqual(
      t.columns.map((c) => c.key),
      ['number', 'name', 'period', 'gross', 'taxable', 'INC', 'SS', 'total'],
    );
    assert.equal(t.totals?.INC, '1300.0000');
    assert.equal(t.totals?.SS, '806.0000');
    const q = quarterlyTaxReport(items, '2026-01-01', '2026-12-31');
    const q1 = q.rows.filter((x) => x.quarter === '2026 Q1');
    assert.equal(q1.length, 3);
    assert.equal(q1.find((x) => x.code === 'ER')?.amount, '612.0000');
    assert.equal(q1.find((x) => x.code === 'INC')?.side, 'Withheld from employees');
    assert.equal(q.rows.filter((x) => x.quarter === '2026 Q2').length, 3);
    const a = annualReport(items, '2026');
    assert.equal(a.rows[0]?.gross, '10000.0000');
    assert.equal(a.rows[1]?.taxes, '486.0000');
    assert.match(a.notes.join(' '), /not a form/);
  });

  await check('strict inputs for runs, entered figures, decisions and payment', () => {
    const ok = { periodStart: '2026-04-01', periodEnd: '2026-04-30', payDate: '2026-04-30' };
    assert.ok(runInput.safeParse(ok).success);
    assert.ok(!runInput.safeParse({ ...ok, periodEnd: '2026-03-31' }).success);
    assert.ok(!runInput.safeParse({ ...ok, payDate: '2026-04-29' }).success);
    assert.ok(!runInput.safeParse({ ...ok, periodStart: '2026-02-30' }).success);
    assert.ok(!runInput.safeParse({ ...ok, extra: 1 }).success);
    assert.ok(runInput.safeParse({ ...ok, employeeIds: [U] }).success);
    assert.ok(!runInput.safeParse({ ...ok, employeeIds: ['x'] }).success);
    assert.ok(itemInput.safeParse({ employeeId: U, regularHours: '160', bonus: '100.5' }).success);
    assert.ok(!itemInput.safeParse({ employeeId: U, regularHours: '-1' }).success);
    assert.ok(!itemInput.safeParse({ employeeId: U, sales: 'abc' }).success);
    assert.ok(decideInput.safeParse({ decision: 'approve' }).success);
    assert.ok(!decideInput.safeParse({ decision: 'maybe' }).success);
    assert.ok(payInput.safeParse({ paidOn: '2026-05-01', reference: 'TRF-1' }).success);
    assert.ok(!payInput.safeParse({ paidOn: '2026-05-01', reference: '' }).success);
    assert.ok(!payInput.safeParse({ paidOn: '2026-05-01', reference: '<b>' }).success);
  });
};

main()
  .then(() => process.stdout.write(`step15-payroll-runs: ${checks} checks passed\n`))
  .catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
    process.exit(1);
  });
