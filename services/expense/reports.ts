// path: services/expense/reports.ts
// Expense reports from the expenses table: summary by month, by category (parents include the categories below), by employee,
// tax deductibility and policy breaches. They are returned as flat tables that the platform's report file builder can export.
import 'server-only';
import { InternalError, ValidationError } from '@/lib/errors';
import type { ReportResult } from '@/lib/reports/types';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { Money } from '@/lib/utils/currency';
import type { Actor } from '@/types/contracts';
import { dayText } from '@/services/accounting/journal-rules';
import { buildReportFile, type ExportFormat, type ReportFile } from '@/services/report/export';
import { listCategories } from './categories';
import {
  categoryReport,
  deductibilityReport,
  employeeReport,
  summaryReport,
  violationsReport,
  type ExpenseRow,
} from './expense-rules';

export const EXPENSE_REPORT_KEYS = [
  'summary',
  'by_category',
  'by_employee',
  'tax_deductibility',
  'policy_violations',
] as const;
export type ExpenseReportKey = (typeof EXPENSE_REPORT_KEYS)[number];

async function rowsOf(companyId: string, from: string, to: string): Promise<ExpenseRow[]> {
  const { data, error } = await getAdminSupabase()
    .from('expenses')
    .select(
      'id, expense_date, category_id, submitted_by, amount_net, tax_amount, total, status, tax_deductible, policy_flags',
    )
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .gte('expense_date', from)
    .lte('expense_date', to)
    .limit(20_000);
  if (error) throw new InternalError(error);
  return (data ?? []).map((r) => ({
    id: String(r.id),
    date: String(r.expense_date),
    categoryId: r.category_id ? String(r.category_id) : null,
    submittedBy: String(r.submitted_by),
    net: Money.parseRounded(String(r.amount_net)).toDbString(),
    tax: Money.parseRounded(String(r.tax_amount)).toDbString(),
    total: Money.parseRounded(String(r.total)).toDbString(),
    status: r.status === 'approved' ? 'approved' : r.status === 'rejected' ? 'rejected' : 'pending',
    taxDeductible: r.tax_deductible === true,
    flags: Array.isArray(r.policy_flags) ? r.policy_flags.length : 0,
  }));
}

export async function expenseReport(
  actor: Actor,
  key: ExpenseReportKey,
  from: string,
  to: string,
): Promise<ReportResult> {
  const companyId = actor.companyId;
  if (!companyId) throw new ValidationError('A company is needed.');
  if (!dayText.safeParse(from).success || !dayText.safeParse(to).success || from > to)
    throw new ValidationError('Check the dates.');
  let rows = await rowsOf(companyId, from, to);
  if (actor.role === 'staff') rows = rows.filter((r) => r.submittedBy === actor.userId);
  switch (key) {
    case 'summary':
      return summaryReport(rows, from, to);
    case 'by_category':
      return categoryReport(
        rows,
        (await listCategories(companyId)).map((c) => ({
          id: c.id,
          name: c.name,
          parentId: c.parentId,
        })),
        from,
        to,
      );
    case 'by_employee': {
      const ids = [...new Set(rows.map((r) => r.submittedBy))];
      const names = new Map<string, string>();
      if (ids.length > 0) {
        const { data, error } = await getAdminSupabase()
          .from('profiles')
          .select('user_id, full_name, email')
          .eq('company_id', companyId)
          .in('user_id', ids)
          .is('deleted_at', null);
        if (error) throw new InternalError(error);
        for (const p of data ?? []) names.set(String(p.user_id), String(p.full_name || p.email));
      }
      return employeeReport(rows, names, from, to);
    }
    case 'tax_deductibility':
      return deductibilityReport(rows, from, to);
    case 'policy_violations':
      return violationsReport(rows, from, to);
  }
}

export async function exportExpenseReport(
  actor: Actor,
  key: ExpenseReportKey,
  from: string,
  to: string,
  format: ExportFormat,
): Promise<ReportFile> {
  const companyId = actor.companyId;
  if (!companyId) throw new ValidationError('A company is needed.');
  const table = await expenseReport(actor, key, from, to);
  return buildReportFile(companyId, table, format, actor.email || actor.userId);
}
