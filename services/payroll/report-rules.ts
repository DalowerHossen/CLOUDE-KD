// path: services/payroll/report-rules.ts
// Payroll reports as pure functions over the items of approved and paid runs: the run summary, the register by employee, tax
// withheld per employee and tax code, the quarterly payroll tax, and the annual statement per employee (the data for year-end
// forms in a plain layout). Each returns the flat table that the report file builder exports. No database here.
import type { ReportColumn, ReportResult } from '@/lib/reports/types';
import { Money } from '@/lib/utils/currency';
import { quarterOf } from '@/services/taxfiling/tax-rules';
import type { PayLine } from './calc-rules';

export interface RunRow {
  id: string;
  number: string;
  periodStart: string;
  periodEnd: string;
  payDate: string;
  status: string;
}

export interface ItemRow {
  runId: string;
  payDate: string;
  periodEnd: string;
  employeeId: string;
  number: string;
  name: string;
  lines: PayLine[];
  gross: string;
  taxable: string;
  employeeTaxes: string;
  deductions: string;
  net: string;
  employerContributions: string;
  employerCost: string;
}

const col = (key: string, label: string, type: ReportColumn['type'] = 'text'): ReportColumn => ({
  key,
  label,
  type,
});
const sum = (rows: readonly ItemRow[], f: (r: ItemRow) => string): Money =>
  Money.sum(rows.map((r) => Money.parse(f(r))));
const quarter = (day: string): string => `${day.slice(0, 4)} Q${quarterOf(day)}`;
const result = (
  key: string,
  title: string,
  from: string,
  to: string,
  columns: ReportColumn[],
  rows: Record<string, string>[],
  totals: Record<string, string> | null,
  notes: string[] = [],
): ReportResult => ({ key, title, period: { from, to }, columns, rows, totals, notes });

const NOTE = 'Only approved and paid pay runs are counted.';

export function summaryReport(
  runs: readonly RunRow[],
  items: readonly ItemRow[],
  from: string,
  to: string,
): ReportResult {
  const rows = runs
    .slice()
    .sort((a, b) => a.periodEnd.localeCompare(b.periodEnd))
    .map((r) => {
      const mine = items.filter((i) => i.runId === r.id);
      return {
        run: r.number,
        period: `${r.periodStart} - ${r.periodEnd}`,
        payDate: r.payDate,
        status: r.status,
        employees: String(mine.length),
        gross: sum(mine, (i) => i.gross).toDbString(),
        taxes: sum(mine, (i) => i.employeeTaxes).toDbString(),
        deductions: sum(mine, (i) => i.deductions).toDbString(),
        net: sum(mine, (i) => i.net).toDbString(),
        employerCost: sum(mine, (i) => i.employerCost).toDbString(),
      };
    });
  return result(
    'payroll_summary',
    'Payroll summary',
    from,
    to,
    [
      col('run', 'Run'),
      col('period', 'Period'),
      col('payDate', 'Pay date', 'date'),
      col('status', 'Status'),
      col('employees', 'Employees', 'number'),
      col('gross', 'Gross', 'money'),
      col('taxes', 'Taxes withheld', 'money'),
      col('deductions', 'Deductions', 'money'),
      col('net', 'Net pay', 'money'),
      col('employerCost', 'Cost to the company', 'money'),
    ],
    rows,
    {
      run: 'Total',
      gross: sum(items, (i) => i.gross).toDbString(),
      taxes: sum(items, (i) => i.employeeTaxes).toDbString(),
      deductions: sum(items, (i) => i.deductions).toDbString(),
      net: sum(items, (i) => i.net).toDbString(),
      employerCost: sum(items, (i) => i.employerCost).toDbString(),
    },
    [NOTE],
  );
}

export function registerReport(items: readonly ItemRow[], from: string, to: string): ReportResult {
  const groups = new Map<string, ItemRow[]>();
  for (const i of items) groups.set(i.employeeId, [...(groups.get(i.employeeId) ?? []), i]);
  const rows = [...groups.values()]
    .sort((a, b) => (a[0]?.number ?? '').localeCompare(b[0]?.number ?? ''))
    .map((g) => ({
      number: g[0]?.number ?? '',
      name: g[0]?.name ?? '',
      payslips: String(g.length),
      gross: sum(g, (i) => i.gross).toDbString(),
      taxes: sum(g, (i) => i.employeeTaxes).toDbString(),
      deductions: sum(g, (i) => i.deductions).toDbString(),
      net: sum(g, (i) => i.net).toDbString(),
      employerCost: sum(g, (i) => i.employerCost).toDbString(),
    }));
  return result(
    'payroll_register',
    'Payroll register by employee',
    from,
    to,
    [
      col('number', 'Number'),
      col('name', 'Employee'),
      col('payslips', 'Payslips', 'number'),
      col('gross', 'Gross', 'money'),
      col('taxes', 'Taxes withheld', 'money'),
      col('deductions', 'Deductions', 'money'),
      col('net', 'Net pay', 'money'),
      col('employerCost', 'Cost to the company', 'money'),
    ],
    rows,
    {
      number: 'Total',
      gross: sum(items, (i) => i.gross).toDbString(),
      taxes: sum(items, (i) => i.employeeTaxes).toDbString(),
      deductions: sum(items, (i) => i.deductions).toDbString(),
      net: sum(items, (i) => i.net).toDbString(),
      employerCost: sum(items, (i) => i.employerCost).toDbString(),
    },
    [NOTE],
  );
}

const taxCodes = (items: readonly ItemRow[]): { code: string; name: string }[] => {
  const seen = new Map<string, string>();
  for (const i of items) for (const l of i.lines) if (l.kind === 'tax') seen.set(l.code, l.name);
  return [...seen].sort((a, b) => a[0].localeCompare(b[0])).map(([code, name]) => ({ code, name }));
};

const withheld = (r: ItemRow, code: string): Money =>
  Money.sum(
    r.lines.filter((l) => l.kind === 'tax' && l.code === code).map((l) => Money.parse(l.amount)),
  );

/** Tax withheld per employee and period, one column per tax code. */
export function taxByEmployeeReport(
  items: readonly ItemRow[],
  from: string,
  to: string,
): ReportResult {
  const codes = taxCodes(items);
  const rows = items
    .slice()
    .sort((a, b) => a.periodEnd.localeCompare(b.periodEnd) || a.number.localeCompare(b.number))
    .map((i) => ({
      number: i.number,
      name: i.name,
      period: i.periodEnd,
      gross: i.gross,
      taxable: i.taxable,
      ...Object.fromEntries(codes.map((c) => [c.code, withheld(i, c.code).toDbString()])),
      total: i.employeeTaxes,
    }));
  const totals: Record<string, string> = {
    number: 'Total',
    gross: sum(items, (i) => i.gross).toDbString(),
    taxable: sum(items, (i) => i.taxable).toDbString(),
    total: sum(items, (i) => i.employeeTaxes).toDbString(),
  };
  for (const c of codes)
    totals[c.code] = Money.sum(items.map((i) => withheld(i, c.code))).toDbString();
  return result(
    'payroll_tax_by_employee',
    'Payroll tax by employee',
    from,
    to,
    [
      col('number', 'Number'),
      col('name', 'Employee'),
      col('period', 'Period end', 'date'),
      col('gross', 'Gross', 'money'),
      col('taxable', 'Taxable pay', 'money'),
      ...codes.map((c) => col(c.code, c.name, 'money')),
      col('total', 'Total withheld', 'money'),
    ],
    rows,
    totals,
    [NOTE],
  );
}

/** Tax withheld from employees and contributions by the employer, per quarter and tax code (for the quarterly filing). */
export function quarterlyTaxReport(
  items: readonly ItemRow[],
  from: string,
  to: string,
): ReportResult {
  const groups = new Map<
    string,
    { quarter: string; code: string; name: string; side: string; amount: Money }
  >();
  for (const i of items)
    for (const l of i.lines) {
      if (l.kind !== 'tax' && l.kind !== 'employer') continue;
      const q = quarter(i.payDate);
      const key = `${q}|${l.kind}|${l.code}`;
      const g = groups.get(key) ?? {
        quarter: q,
        code: l.code,
        name: l.name,
        side: l.kind === 'tax' ? 'Withheld from employees' : 'Employer contribution',
        amount: Money.zero(),
      };
      groups.set(key, { ...g, amount: g.amount.add(l.amount) });
    }
  const list = [...groups.values()].sort(
    (a, b) =>
      a.quarter.localeCompare(b.quarter) ||
      a.side.localeCompare(b.side) ||
      a.code.localeCompare(b.code),
  );
  return result(
    'payroll_tax_quarterly',
    'Payroll tax by quarter',
    from,
    to,
    [
      col('quarter', 'Quarter'),
      col('side', 'Side'),
      col('code', 'Tax'),
      col('name', 'Name'),
      col('amount', 'Amount', 'money'),
    ],
    list.map((g) => ({
      quarter: g.quarter,
      side: g.side,
      code: g.code,
      name: g.name,
      amount: g.amount.toDbString(),
    })),
    { quarter: 'Total', amount: Money.sum(list.map((g) => g.amount)).toDbString() },
    [NOTE, 'The quarter is the quarter of the pay date.'],
  );
}

/** Totals of a calendar year per employee: the data for year-end forms (not a form of any authority). */
export function annualReport(items: readonly ItemRow[], year: string): ReportResult {
  const groups = new Map<string, ItemRow[]>();
  for (const i of items) groups.set(i.employeeId, [...(groups.get(i.employeeId) ?? []), i]);
  const rows = [...groups.values()]
    .sort((a, b) => (a[0]?.number ?? '').localeCompare(b[0]?.number ?? ''))
    .map((g) => ({
      number: g[0]?.number ?? '',
      name: g[0]?.name ?? '',
      gross: sum(g, (i) => i.gross).toDbString(),
      taxable: sum(g, (i) => i.taxable).toDbString(),
      taxes: sum(g, (i) => i.employeeTaxes).toDbString(),
      deductions: sum(g, (i) => i.deductions).toDbString(),
      net: sum(g, (i) => i.net).toDbString(),
    }));
  return result(
    'payroll_annual',
    `Annual payroll statement ${year}`,
    `${year}-01-01`,
    `${year}-12-31`,
    [
      col('number', 'Number'),
      col('name', 'Employee'),
      col('gross', 'Gross pay', 'money'),
      col('taxable', 'Taxable pay', 'money'),
      col('taxes', 'Tax withheld', 'money'),
      col('deductions', 'Deductions', 'money'),
      col('net', 'Net pay', 'money'),
    ],
    rows,
    {
      number: 'Total',
      gross: sum(items, (i) => i.gross).toDbString(),
      taxable: sum(items, (i) => i.taxable).toDbString(),
      taxes: sum(items, (i) => i.employeeTaxes).toDbString(),
      deductions: sum(items, (i) => i.deductions).toDbString(),
      net: sum(items, (i) => i.net).toDbString(),
    },
    [
      NOTE,
      'This is the data for year-end forms in a plain layout. Tax identification numbers are not included; it is not a form of any tax authority.',
    ],
  );
}
