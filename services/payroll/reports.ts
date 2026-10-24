// path: services/payroll/reports.ts
// Payroll reports from the approved and paid pay runs: the run summary, the register by employee, tax withheld per employee,
// payroll tax by quarter and the annual statement. The pages show the tables and the file builder exports them as CSV, Excel
// and PDF (the audited export is the plain route that calls `reportTable`).
import 'server-only';
import { InternalError, ValidationError } from '@/lib/errors';
import type { ReportResult } from '@/lib/reports/types';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { Money } from '@/lib/utils/currency';
import type { Actor } from '@/types/contracts';
import { dayText } from '@/services/accounting/journal-rules';
import type { PayLine } from './calc-rules';
import {
  annualReport,
  quarterlyTaxReport,
  registerReport,
  summaryReport,
  taxByEmployeeReport,
  type ItemRow,
  type RunRow,
} from './report-rules';

export const PAYROLL_REPORT_KEYS = [
  'summary',
  'register',
  'tax_by_employee',
  'quarterly_tax',
  'annual',
] as const;
export type PayrollReportKey = (typeof PAYROLL_REPORT_KEYS)[number];

const m = (v: string | number): string => Money.parseRounded(String(v)).toDbString();

async function load(
  companyId: string,
  from: string,
  to: string,
): Promise<{ runs: RunRow[]; items: ItemRow[] }> {
  const admin = getAdminSupabase();
  const runs = await admin
    .from('pay_runs')
    .select('id, run_number, period_start, period_end, pay_date, status')
    .eq('company_id', companyId)
    .in('status', ['approved', 'paid'])
    .gte('pay_date', from)
    .lte('pay_date', to)
    .is('deleted_at', null)
    .order('pay_date')
    .limit(1000);
  if (runs.error) throw new InternalError(runs.error);
  const list: RunRow[] = (runs.data ?? []).map((r) => ({
    id: String(r.id),
    number: String(r.run_number),
    periodStart: String(r.period_start),
    periodEnd: String(r.period_end),
    payDate: String(r.pay_date),
    status: String(r.status),
  }));
  const items: ItemRow[] = [];
  for (let i = 0; i < list.length; i += 100) {
    const ids = list.slice(i, i + 100).map((r) => r.id);
    const { data, error } = await admin
      .from('pay_run_items')
      .select(
        'run_id, employee_id, employee_number, employee_name, lines, gross, taxable, employee_taxes, deductions, net, employer_contributions, employer_cost',
      )
      .eq('company_id', companyId)
      .in('run_id', ids)
      .eq('active', true)
      .is('deleted_at', null)
      .limit(50_000);
    if (error) throw new InternalError(error);
    for (const r of data ?? []) {
      const run = list.find((x) => x.id === String(r.run_id));
      items.push({
        runId: String(r.run_id),
        payDate: run?.payDate ?? '',
        periodEnd: run?.periodEnd ?? '',
        employeeId: String(r.employee_id),
        number: String(r.employee_number),
        name: String(r.employee_name),
        lines: (r.lines as PayLine[] | null) ?? [],
        gross: m(r.gross as string | number),
        taxable: m(r.taxable as string | number),
        employeeTaxes: m(r.employee_taxes as string | number),
        deductions: m(r.deductions as string | number),
        net: m(r.net as string | number),
        employerContributions: m(r.employer_contributions as string | number),
        employerCost: m(r.employer_cost as string | number),
      });
    }
  }
  return { runs: list, items };
}

export async function payrollReport(
  actor: Actor,
  key: PayrollReportKey,
  from: string,
  to: string,
): Promise<ReportResult> {
  const companyId = actor.companyId;
  if (!companyId) throw new ValidationError('A company is needed.');
  if (!dayText.safeParse(from).success || !dayText.safeParse(to).success || from > to)
    throw new ValidationError('Check the dates.');
  const year = key === 'annual' ? to.slice(0, 4) : null;
  const { runs, items } = await load(
    companyId,
    year ? `${year}-01-01` : from,
    year ? `${year}-12-31` : to,
  );
  switch (key) {
    case 'summary':
      return summaryReport(runs, items, from, to);
    case 'register':
      return registerReport(items, from, to);
    case 'tax_by_employee':
      return taxByEmployeeReport(items, from, to);
    case 'quarterly_tax':
      return quarterlyTaxReport(items, from, to);
    case 'annual':
      return annualReport(items, year ?? to.slice(0, 4));
  }
}
