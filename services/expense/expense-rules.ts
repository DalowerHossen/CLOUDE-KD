// path: services/expense/expense-rules.ts
// The rules of expenses as pure functions: input shapes, the total, policy checks (limits, receipts, auto-approval, flag or
// block), what happens to a new expense, the duplicate test, and the report tables. No database here.
import { z } from 'zod';
import type { ReportColumn, ReportResult } from '@/lib/reports/types';
import { Money } from '@/lib/utils/currency';
import { dayText } from '@/services/accounting/journal-rules';

const plain = (min: number, max: number): z.ZodString =>
  z
    .string()
    .trim()
    .min(min)
    .max(max)
    .refine((v) => !/[<>]/.test(v), { message: 'Angle brackets are not allowed.' });
const amount = z.string().regex(/^\d{1,14}(\.\d{1,4})?$/, 'Enter an amount like 100 or 100.50.');

export const expenseInput = z
  .object({
    expenseDate: dayText,
    categoryId: z.string().uuid().nullable().default(null),
    vendor: plain(0, 120).default(''),
    description: plain(0, 500).default(''),
    amountNet: amount,
    taxAmount: amount.default('0'),
    reimbursable: z.boolean().default(false),
    /** The company already paid it (card, cash, bank). Otherwise it is owed and paid later. */
    paid: z.boolean().default(false),
    paidVia: z.enum(['bank', 'cash', 'card']).nullable().default(null),
    receiptId: z.string().uuid().nullable().default(null),
    /** An owner may go past a policy breach by saying why. */
    overrideReason: plain(0, 300).default(''),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (!safeMoney(v.amountNet).isPositive())
      ctx.addIssue({
        code: 'custom',
        path: ['amountNet'],
        message: 'The amount must be above zero.',
      });
    if (v.paid && v.reimbursable)
      ctx.addIssue({
        code: 'custom',
        path: ['paid'],
        message: 'An expense an employee pays is paid back later, not paid now.',
      });
  });
export type ExpenseInput = z.infer<typeof expenseInput>;

export const expenseUpdate = z
  .object({ version: z.number().int().min(1), expense: expenseInput })
  .strict();

export const categoryInput = z
  .object({
    name: plain(1, 80),
    parentId: z.string().uuid().nullable().default(null),
    accountId: z.string().uuid().nullable().default(null),
    taxDeductible: z.boolean().default(true),
  })
  .strict();
export const categoryUpdate = z
  .object({
    version: z.number().int().min(1),
    name: plain(1, 80).optional(),
    accountId: z.string().uuid().nullable().optional(),
    taxDeductible: z.boolean().optional(),
    status: z.enum(['active', 'inactive']).optional(),
  })
  .strict();

const limit = amount.nullable().default(null);
export const policyInput = z
  .object({
    name: plain(1, 100),
    categoryId: z.string().uuid().nullable().default(null),
    role: z.enum(['owner', 'staff']).nullable().default(null),
    maxPerExpense: limit,
    maxPerDay: limit,
    maxPerMonth: limit,
    receiptRequiredAbove: limit,
    autoApproveBelow: limit,
    breachAction: z.enum(['flag', 'block']).default('flag'),
  })
  .strict();
export type PolicyInput = z.infer<typeof policyInput>;

export const decideInput = z
  .object({
    decision: z.enum(['approve', 'reject']),
    reason: plain(0, 300).default(''),
    overrideReason: plain(0, 300).default(''),
  })
  .strict()
  .refine((v) => v.decision === 'approve' || v.reason.length >= 3, {
    message: 'Give a reason for rejecting.',
    path: ['reason'],
  });

export const paidInput = z
  .object({ paidVia: z.enum(['bank', 'cash', 'card']), reference: plain(0, 120).default('') })
  .strict();

export const recurringExpenseInput = z
  .object({
    name: plain(1, 100),
    categoryId: z.string().uuid().nullable().default(null),
    vendor: plain(0, 120).default(''),
    description: plain(0, 500).default(''),
    amountNet: amount,
    taxAmount: amount.default('0'),
    frequency: z.enum(['monthly', 'quarterly', 'yearly']).default('monthly'),
    dayOfMonth: z.number().int().min(1).max(28).default(1),
    firstRun: dayText,
    endDate: dayText.nullable().default(null),
    paid: z.boolean().default(false),
  })
  .strict()
  .refine((v) => safeMoney(v.amountNet).isPositive(), {
    message: 'The amount must be above zero.',
    path: ['amountNet'],
  });
export type RecurringExpenseInput = z.infer<typeof recurringExpenseInput>;

function safeMoney(text: string): Money {
  try {
    return Money.parse(text);
  } catch {
    return Money.zero();
  }
}

export const totalOf = (net: string, tax: string): Money => safeMoney(net).add(safeMoney(tax));

/* ---------- policies ---------- */

export interface Policy {
  id: string;
  name: string;
  categoryId: string | null;
  role: 'owner' | 'staff' | null;
  maxPerExpense: string | null;
  maxPerDay: string | null;
  maxPerMonth: string | null;
  receiptRequiredAbove: string | null;
  autoApproveBelow: string | null;
  breachAction: 'flag' | 'block';
  status: 'active' | 'inactive';
}

export interface PolicyFacts {
  total: Money;
  /** The category and its parents, so a policy on "Travel" covers "Flights". */
  categoryChain: readonly string[];
  role: 'owner' | 'staff';
  hasReceipt: boolean;
  /** What the same person already submitted that day and that month (not rejected), without this expense. */
  daySoFar: Money;
  monthSoFar: Money;
}

export interface Violation {
  policyId: string;
  policyName: string;
  rule: 'max_per_expense' | 'max_per_day' | 'max_per_month' | 'receipt_required';
  message: string;
  action: 'flag' | 'block';
}

export interface PolicyResult {
  violations: Violation[];
  blocked: boolean;
  /** A policy says an expense this small needs no approval (and nothing was breached). */
  autoApprove: boolean;
}

const applies = (p: Policy, f: PolicyFacts): boolean =>
  p.status === 'active' &&
  (p.categoryId === null || f.categoryChain.includes(p.categoryId)) &&
  (p.role === null || p.role === f.role);

export function evaluatePolicies(policies: readonly Policy[], f: PolicyFacts): PolicyResult {
  const violations: Violation[] = [];
  let autoApprove = false;
  for (const p of policies.filter((x) => applies(x, f))) {
    const add = (rule: Violation['rule'], message: string): void => {
      violations.push({
        policyId: p.id,
        policyName: p.name,
        rule,
        message,
        action: p.breachAction,
      });
    };
    if (p.maxPerExpense !== null && f.total.gt(p.maxPerExpense))
      add(
        'max_per_expense',
        `The expense is above the limit of ${safeMoney(p.maxPerExpense).toDbString()} for one expense.`,
      );
    if (p.maxPerDay !== null && f.daySoFar.add(f.total).gt(p.maxPerDay))
      add(
        'max_per_day',
        `The day total would be above the limit of ${safeMoney(p.maxPerDay).toDbString()}.`,
      );
    if (p.maxPerMonth !== null && f.monthSoFar.add(f.total).gt(p.maxPerMonth))
      add(
        'max_per_month',
        `The month total would be above the limit of ${safeMoney(p.maxPerMonth).toDbString()}.`,
      );
    if (p.receiptRequiredAbove !== null && !f.hasReceipt && f.total.gt(p.receiptRequiredAbove))
      add(
        'receipt_required',
        `A receipt is needed above ${safeMoney(p.receiptRequiredAbove).toDbString()}.`,
      );
    if (p.autoApproveBelow !== null && f.total.lt(p.autoApproveBelow)) autoApprove = true;
  }
  return {
    violations,
    blocked: violations.some((v) => v.action === 'block'),
    autoApprove: autoApprove && violations.length === 0,
  };
}

export type Outcome =
  | { kind: 'refuse'; reason: string }
  | { kind: 'approved'; override: string | null }
  | { kind: 'pending' };

/**
 * What happens to a new expense. A blocked expense is refused (an owner can go past it with a reason). An owner's expense is
 * approved at once unless a policy was breached, then it waits for the owner's own decision with the override reason. A staff
 * expense is approved at once only when a policy allows it; otherwise it waits for the owner.
 */
export function outcomeOf(
  role: 'owner' | 'staff',
  result: PolicyResult,
  overrideReason: string,
): Outcome {
  if (result.blocked) {
    if (role === 'owner' && overrideReason.trim().length >= 10)
      return { kind: 'approved', override: overrideReason.trim() };
    return {
      kind: 'refuse',
      reason: result.violations
        .filter((v) => v.action === 'block')
        .map((v) => v.message)
        .join(' '),
    };
  }
  if (result.violations.length > 0) {
    if (role === 'owner' && overrideReason.trim().length >= 10)
      return { kind: 'approved', override: overrideReason.trim() };
    return { kind: 'pending' };
  }
  if (role === 'owner' || result.autoApprove) return { kind: 'approved', override: null };
  return { kind: 'pending' };
}

/** The same date and total, and the same receipt checksum (or, without a receipt, the same vendor). */
export function isDuplicate(
  a: { expenseDate: string; total: string; receiptHash: string | null; vendor: string },
  b: { expenseDate: string; total: string; receiptHash: string | null; vendor: string },
): boolean {
  if (a.expenseDate !== b.expenseDate || !safeMoney(a.total).eq(safeMoney(b.total))) return false;
  if (a.receiptHash && b.receiptHash) return a.receiptHash === b.receiptHash;
  return a.vendor.trim() !== '' && a.vendor.trim().toLowerCase() === b.vendor.trim().toLowerCase();
}

/* ---------- reports ---------- */

export interface ExpenseRow {
  id: string;
  date: string;
  categoryId: string | null;
  submittedBy: string;
  net: string;
  tax: string;
  total: string;
  status: 'pending' | 'approved' | 'rejected';
  taxDeductible: boolean;
  flags: number;
}

export interface CategoryNode {
  id: string;
  name: string;
  parentId: string | null;
}

const col = (key: string, label: string, type: ReportColumn['type'] = 'text'): ReportColumn => ({
  key,
  label,
  type,
});
const approvedOnly = (rows: readonly ExpenseRow[]): ExpenseRow[] =>
  rows.filter((r) => r.status === 'approved');

function table(
  key: string,
  title: string,
  from: string,
  to: string,
  columns: ReportColumn[],
  rows: Record<string, string>[],
  totals: Record<string, string> | null,
  notes: string[] = [],
): ReportResult {
  return { key, title, period: { from, to }, columns, rows, totals, notes };
}

export function summaryReport(rows: readonly ExpenseRow[], from: string, to: string): ReportResult {
  const byMonth = new Map<string, { count: number; total: Money }>();
  for (const r of approvedOnly(rows)) {
    const k = r.date.slice(0, 7);
    const cur = byMonth.get(k) ?? { count: 0, total: Money.zero() };
    byMonth.set(k, { count: cur.count + 1, total: cur.total.add(r.total) });
  }
  const months = [...byMonth.keys()].sort();
  const total = Money.sum([...byMonth.values()].map((x) => x.total));
  const count = [...byMonth.values()].reduce((s, x) => s + x.count, 0);
  const pending = rows.filter((r) => r.status === 'pending');
  return table(
    'expense_summary',
    'Expense summary',
    from,
    to,
    [col('month', 'Month'), col('count', 'Expenses', 'number'), col('total', 'Total', 'money')],
    months.map((m) => ({
      month: m,
      count: String(byMonth.get(m)?.count ?? 0),
      total: (byMonth.get(m)?.total ?? Money.zero()).toDbString(),
    })),
    { month: 'Total', count: String(count), total: total.toDbString() },
    [
      `Waiting for approval: ${pending.length} expense(s), ${Money.sum(pending.map((r) => Money.parse(r.total))).toDbString()}`,
    ],
  );
}

/** Totals by category with each parent including the categories below it. */
export function categoryReport(
  rows: readonly ExpenseRow[],
  categories: readonly CategoryNode[],
  from: string,
  to: string,
): ReportResult {
  const own = new Map<string, Money>();
  let none = Money.zero();
  for (const r of approvedOnly(rows)) {
    if (r.categoryId) own.set(r.categoryId, (own.get(r.categoryId) ?? Money.zero()).add(r.total));
    else none = none.add(r.total);
  }
  const byParent = new Map<string | null, CategoryNode[]>();
  for (const c of categories) byParent.set(c.parentId, [...(byParent.get(c.parentId) ?? []), c]);
  const rollup = new Map<string, Money>();
  const sum = (c: CategoryNode): Money => {
    const t = (byParent.get(c.id) ?? []).reduce(
      (s, k) => s.add(sum(k)),
      own.get(c.id) ?? Money.zero(),
    );
    rollup.set(c.id, t);
    return t;
  };
  for (const c of byParent.get(null) ?? []) sum(c);
  const out: Record<string, string>[] = [];
  const walk = (list: readonly CategoryNode[], depth: number): void => {
    for (const c of [...list].sort((a, b) => a.name.localeCompare(b.name))) {
      const t = rollup.get(c.id) ?? Money.zero();
      if (!t.isZero()) out.push({ name: `${'  '.repeat(depth)}${c.name}`, total: t.toDbString() });
      walk(byParent.get(c.id) ?? [], depth + 1);
    }
  };
  walk(byParent.get(null) ?? [], 0);
  if (!none.isZero()) out.push({ name: 'No category', total: none.toDbString() });
  const total = Money.sum(approvedOnly(rows).map((r) => Money.parse(r.total)));
  return table(
    'expense_by_category',
    'Expenses by category',
    from,
    to,
    [col('name', 'Category'), col('total', 'Total', 'money')],
    out,
    { name: 'Total', total: total.toDbString() },
  );
}

export function employeeReport(
  rows: readonly ExpenseRow[],
  names: ReadonlyMap<string, string>,
  from: string,
  to: string,
): ReportResult {
  const by = new Map<string, { count: number; total: Money }>();
  for (const r of approvedOnly(rows)) {
    const cur = by.get(r.submittedBy) ?? { count: 0, total: Money.zero() };
    by.set(r.submittedBy, { count: cur.count + 1, total: cur.total.add(r.total) });
  }
  const list = [...by.entries()].sort((a, b) =>
    b[1].total.gt(a[1].total) ? 1 : b[1].total.lt(a[1].total) ? -1 : 0,
  );
  return table(
    'expense_by_employee',
    'Expenses by employee',
    from,
    to,
    [col('name', 'Employee'), col('count', 'Expenses', 'number'), col('total', 'Total', 'money')],
    list.map(([id, v]) => ({
      name: names.get(id) ?? id.slice(0, 8),
      count: String(v.count),
      total: v.total.toDbString(),
    })),
    {
      name: 'Total',
      count: String(list.reduce((s, [, v]) => s + v.count, 0)),
      total: Money.sum(list.map(([, v]) => v.total)).toDbString(),
    },
  );
}

export function deductibilityReport(
  rows: readonly ExpenseRow[],
  from: string,
  to: string,
): ReportResult {
  const ok = approvedOnly(rows);
  const sum = (list: readonly ExpenseRow[], f: 'net' | 'tax' | 'total'): Money =>
    Money.sum(list.map((r) => Money.parse(r[f])));
  const yes = ok.filter((r) => r.taxDeductible);
  const no = ok.filter((r) => !r.taxDeductible);
  return table(
    'expense_tax_deductibility',
    'Expense tax deductibility',
    from,
    to,
    [
      col('kind', 'Kind'),
      col('net', 'Net', 'money'),
      col('tax', 'Tax', 'money'),
      col('total', 'Total', 'money'),
    ],
    [
      {
        kind: 'Deductible',
        net: sum(yes, 'net').toDbString(),
        tax: sum(yes, 'tax').toDbString(),
        total: sum(yes, 'total').toDbString(),
      },
      {
        kind: 'Not deductible',
        net: sum(no, 'net').toDbString(),
        tax: sum(no, 'tax').toDbString(),
        total: sum(no, 'total').toDbString(),
      },
    ],
    {
      kind: 'Total',
      net: sum(ok, 'net').toDbString(),
      tax: sum(ok, 'tax').toDbString(),
      total: sum(ok, 'total').toDbString(),
    },
  );
}

export function violationsReport(
  rows: readonly ExpenseRow[],
  from: string,
  to: string,
): ReportResult {
  const flagged = rows.filter((r) => r.flags > 0);
  return table(
    'expense_policy_violations',
    'Expense policy violations',
    from,
    to,
    [
      col('date', 'Date', 'date'),
      col('total', 'Total', 'money'),
      col('status', 'Status'),
      col('flags', 'Breaches', 'number'),
    ],
    flagged.map((r) => ({
      date: r.date,
      total: r.total,
      status: r.status,
      flags: String(r.flags),
    })),
    null,
  );
}
