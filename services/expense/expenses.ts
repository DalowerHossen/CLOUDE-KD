// path: services/expense/expenses.ts
// Expenses of a company. A new expense is checked against the policies, looked up for duplicates (same date and total, and the
// same receipt checksum or the same vendor), and then either approved at once or sent to the owner. When an expense is approved
// the event `expense.created` is published: accounting turns it into a journal entry (15.2). An expense that is not yet paid
// stays owed to the vendor (or to the employee who paid it) until `markPaid` books the payment.
import 'server-only';
import { getService } from '@/lib/container';
import {
  ConflictError,
  DuplicateError,
  ForbiddenError,
  InternalError,
  NotFoundError,
  ValidationError,
} from '@/lib/errors';
import { createLogger } from '@/lib/logger';
import { toInt } from '@/lib/reports/numbers';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { Money } from '@/lib/utils/currency';
import type { Actor } from '@/types/contracts';
import { resolveAccount } from '@/services/accounting/accounts';
import { mapAccountingError } from '@/services/accounting/db-errors';
import { postSystemEntry } from '@/services/accounting/journals';
import { accountOf, chainOf, listCategories, type CategoryView } from './categories';
import {
  decideInput,
  evaluatePolicies,
  expenseInput,
  expenseUpdate,
  isDuplicate,
  outcomeOf,
  paidInput,
  totalOf,
  type ExpenseInput,
  type Violation,
} from './expense-rules';
import { listPolicies } from './policies';
import { getReceipt, receiptsOf, assertFree, type ReceiptView } from './receipts';

const log = createLogger({ component: 'expenses' });
export const EXPENSE_APPROVAL_ACTION = 'expense.approve';

export interface ExpenseView {
  id: string;
  expenseDate: string;
  categoryId: string | null;
  vendor: string;
  description: string;
  amountNet: string;
  taxAmount: string;
  total: string;
  status: 'pending' | 'approved' | 'rejected';
  paymentStatus: 'unpaid' | 'paid';
  paidAt: string | null;
  paidVia: string | null;
  reimbursable: boolean;
  submittedBy: string;
  policyFlags: Violation[];
  overrideReason: string | null;
  rejectReason: string | null;
  duplicateOf: string | null;
  version: number;
  createdAt: string;
}

export interface ExpenseDetail extends ExpenseView {
  receipts: ReceiptView[];
  categoryName: string;
  submitterName: string;
}

const COLUMNS =
  'id, expense_date, category_id, vendor, description, amount_net, tax_amount, total, status, payment_status, paid_at, paid_via, reimbursable, submitted_by, policy_flags, override_reason, reject_reason, duplicate_of, receipt_hash, approval_request_id, tax_deductible, version, created_at';

interface Row {
  id: string;
  expense_date: string;
  category_id: string | null;
  vendor: string;
  description: string;
  amount_net: string | number;
  tax_amount: string | number;
  total: string | number;
  status: string;
  payment_status: string;
  paid_at: string | null;
  paid_via: string | null;
  reimbursable: boolean;
  submitted_by: string;
  policy_flags: Violation[];
  override_reason: string | null;
  reject_reason: string | null;
  duplicate_of: string | null;
  receipt_hash: string | null;
  approval_request_id: string | null;
  tax_deductible: boolean;
  version: number;
  created_at: string;
}

const m = (v: string | number): string => Money.parseRounded(String(v)).toDbString();

const view = (r: Row): ExpenseView => ({
  id: r.id,
  expenseDate: String(r.expense_date),
  categoryId: r.category_id,
  vendor: r.vendor,
  description: r.description,
  amountNet: m(r.amount_net),
  taxAmount: m(r.tax_amount),
  total: m(r.total),
  status: r.status === 'approved' ? 'approved' : r.status === 'rejected' ? 'rejected' : 'pending',
  paymentStatus: r.payment_status === 'paid' ? 'paid' : 'unpaid',
  paidAt: r.paid_at,
  paidVia: r.paid_via,
  reimbursable: r.reimbursable,
  submittedBy: r.submitted_by,
  policyFlags: Array.isArray(r.policy_flags) ? r.policy_flags : [],
  overrideReason: r.override_reason,
  rejectReason: r.reject_reason,
  duplicateOf: r.duplicate_of,
  version: toInt(r.version),
  createdAt: r.created_at,
});

function need(actor: Actor): string {
  if (!actor.companyId) throw new ValidationError('A company is needed.');
  return actor.companyId;
}

const roleOf = (actor: Actor): 'owner' | 'staff' => (actor.role === 'staff' ? 'staff' : 'owner');

async function audit(
  companyId: string,
  action: string,
  id: string,
  metadata: Record<string, unknown>,
): Promise<void> {
  await getService('audit').record({
    action,
    resourceType: 'expense',
    resourceId: id,
    companyId,
    metadata,
  });
}

async function rowOf(companyId: string, id: string): Promise<Row> {
  const { data, error } = await getAdminSupabase()
    .from('expenses')
    .select(COLUMNS)
    .eq('company_id', companyId)
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw new InternalError(error);
  if (!data) throw new NotFoundError();
  return data as unknown as Row;
}

/** A staff member sees and changes only their own expenses. */
function assertVisible(actor: Actor, row: Row): void {
  if (actor.role === 'staff' && row.submitted_by !== actor.userId) throw new NotFoundError();
}

/** The last day of the month of a date (2026-02-10 gives 2026-02-28). */
function lastDayOf(day: string): string {
  return new Date(Date.UTC(toInt(day.slice(0, 4)), toInt(day.slice(5, 7)), 0))
    .toISOString()
    .slice(0, 10);
}

async function spentBy(
  companyId: string,
  userId: string,
  from: string,
  to: string,
  exceptId: string | null,
): Promise<Money> {
  let q = getAdminSupabase()
    .from('expenses')
    .select('total')
    .eq('company_id', companyId)
    .eq('submitted_by', userId)
    .in('status', ['pending', 'approved'])
    .is('deleted_at', null)
    .gte('expense_date', from)
    .lte('expense_date', to);
  if (exceptId) q = q.neq('id', exceptId);
  const { data, error } = await q.limit(5000);
  if (error) throw new InternalError(error);
  return Money.sum((data ?? []).map((r) => Money.parseRounded(String(r.total))));
}

async function loadReceipt(
  companyId: string,
  receiptId: string | null,
  own: string | null,
): Promise<ReceiptView | null> {
  if (!receiptId) return null;
  const r = await getReceipt(companyId, receiptId);
  if (r.expenseId !== own) assertFree(r);
  return r;
}

interface Checked {
  total: Money;
  receipt: ReceiptView | null;
  violations: Violation[];
  outcome: ReturnType<typeof outcomeOf>;
  categories: CategoryView[];
  duplicateOf: string | null;
}

async function check(
  actor: Actor,
  companyId: string,
  d: ExpenseInput,
  own: string | null,
  confirmDuplicate: boolean,
  submitter: string,
  role: 'owner' | 'staff',
): Promise<Checked> {
  const total = totalOf(d.amountNet, d.taxAmount);
  const [categories, policies, receipt] = await Promise.all([
    listCategories(companyId),
    listPolicies(companyId),
    loadReceipt(companyId, d.receiptId, own),
  ]);
  if (d.categoryId && !categories.some((c) => c.id === d.categoryId && c.status === 'active'))
    throw new ValidationError('Choose an active category.');
  const monthStart = `${d.expenseDate.slice(0, 7)}-01`;
  const [daySoFar, monthSoFar] = await Promise.all([
    spentBy(companyId, submitter, d.expenseDate, d.expenseDate, own),
    spentBy(companyId, submitter, monthStart, lastDayOf(d.expenseDate), own),
  ]);
  const result = evaluatePolicies(policies, {
    total,
    categoryChain: chainOf(categories, d.categoryId),
    role,
    hasReceipt: receipt !== null,
    daySoFar,
    monthSoFar,
  });
  const outcome = outcomeOf(role, result, d.overrideReason);
  if (outcome.kind === 'refuse')
    throw new ValidationError(outcome.reason || 'A policy does not allow this expense.');
  // Duplicates: the same date and total with the same receipt checksum (or the same vendor when there is no receipt).
  const { data, error } = await getAdminSupabase()
    .from('expenses')
    .select('id, expense_date, total, receipt_hash, vendor')
    .eq('company_id', companyId)
    .eq('expense_date', d.expenseDate)
    .eq('total', total.toDbString())
    .is('deleted_at', null)
    .neq('status', 'rejected')
    .limit(20);
  if (error) throw new InternalError(error);
  const mine = {
    expenseDate: d.expenseDate,
    total: total.toDbString(),
    receiptHash: receipt?.sha256 ?? null,
    vendor: d.vendor,
  };
  const dup = (data ?? []).find(
    (x) =>
      String(x.id) !== own &&
      isDuplicate(mine, {
        expenseDate: String(x.expense_date),
        total: m(String(x.total)),
        receiptHash: x.receipt_hash ? String(x.receipt_hash) : null,
        vendor: String(x.vendor ?? ''),
      }),
  );
  if (dup && !confirmDuplicate)
    throw new DuplicateError(
      'An expense with the same date, amount and receipt or vendor exists.',
      { expenseId: String(dup.id) },
    );
  void actor;
  return {
    total,
    receipt,
    violations: result.violations,
    outcome,
    categories,
    duplicateOf: dup ? String(dup.id) : null,
  };
}

/** Publishes the event that accounting books. Safe to repeat: the posting is made once per expense. */
export async function publishExpense(
  row: Row,
  companyId: string,
  categories: readonly CategoryView[],
): Promise<void> {
  const admin = getAdminSupabase();
  await getService('events').publish({
    name: 'expense.created',
    companyId,
    payload: {
      expenseId: row.id,
      date: String(row.expense_date),
      net: m(row.amount_net),
      tax: m(row.tax_amount),
      accountId: accountOf(categories, row.category_id) ?? '',
      paid: row.payment_status === 'paid',
      memo: (row.vendor || row.description || 'Expense').slice(0, 200),
    },
  });
  const { error } = await admin
    .from('expenses')
    .update({ event_published_at: new Date().toISOString() })
    .eq('id', row.id);
  if (error) log.error('event time not saved', { id: row.id, error: error.message });
}

async function tell(
  companyId: string,
  userId: string | null,
  type: string,
  title: string,
  body: string,
): Promise<void> {
  try {
    await getService('notification').notify(
      userId
        ? { userId, companyId, type, title, body, href: '/expenses' }
        : { companyId, type, title, body, href: '/expenses' },
    );
  } catch (error) {
    log.error('notice not sent', { type, error: String(error) });
  }
}

export interface CreateOptions {
  confirmDuplicate?: boolean;
}

export async function createExpense(
  actor: Actor,
  input: unknown,
  options: CreateOptions = {},
): Promise<ExpenseDetail> {
  const companyId = need(actor);
  const parsed = expenseInput.safeParse(input);
  if (!parsed.success)
    throw new ValidationError(parsed.error.issues[0]?.message ?? 'The expense is not valid.');
  const d = parsed.data;
  const role = roleOf(actor);
  const c = await check(
    actor,
    companyId,
    d,
    null,
    options.confirmDuplicate === true,
    actor.userId,
    role,
  );
  const approved = c.outcome.kind === 'approved';
  const now = new Date().toISOString();
  const category = c.categories.find((x) => x.id === d.categoryId);
  const { data, error } = await getAdminSupabase()
    .from('expenses')
    .insert({
      company_id: companyId,
      expense_date: d.expenseDate,
      category_id: d.categoryId,
      vendor: d.vendor,
      description: d.description,
      amount_net: d.amountNet,
      tax_amount: d.taxAmount,
      total: c.total.toDbString(),
      status: approved ? 'approved' : 'pending',
      payment_status: d.paid ? 'paid' : 'unpaid',
      paid_at: d.paid ? now : null,
      paid_via: d.paid ? (d.paidVia ?? 'bank') : null,
      reimbursable: d.reimbursable,
      submitted_by: actor.userId,
      decided_by: approved ? actor.userId : null,
      decided_at: approved ? now : null,
      override_reason: c.outcome.kind === 'approved' ? c.outcome.override : null,
      policy_flags: c.violations,
      receipt_hash: c.receipt?.sha256 ?? null,
      duplicate_of: c.duplicateOf,
      tax_deductible: category?.taxDeductible ?? true,
    })
    .select(COLUMNS)
    .single();
  if (error) mapAccountingError(error);
  const row = data as unknown as Row;
  if (c.receipt) {
    const link = await getAdminSupabase()
      .from('receipts')
      .update({ expense_id: row.id })
      .eq('id', c.receipt.id)
      .eq('company_id', companyId)
      .is('expense_id', null);
    if (link.error) throw new InternalError(link.error);
  }
  if (approved) {
    await publishExpense(row, companyId, c.categories).catch((e: unknown) =>
      log.error('expense event not published', { id: row.id, error: String(e) }),
    );
  } else {
    const state = await getService('approval').request({
      action: EXPENSE_APPROVAL_ACTION,
      payload: { expenseId: row.id, total: c.total.toDbString() },
      requesterId: actor.userId,
      companyId,
    });
    const up = await getAdminSupabase()
      .from('expenses')
      .update({ approval_request_id: state.requestId })
      .eq('id', row.id);
    if (up.error) throw new InternalError(up.error);
    await tell(
      companyId,
      null,
      'expense.pending',
      'An expense waits for approval',
      `${d.vendor || 'Expense'}: ${c.total.toDbString()} USD`,
    );
  }
  await audit(companyId, 'expense.created', row.id, {
    total: c.total.toDbString(),
    status: row.status,
    flags: c.violations.length,
  });
  return getExpense(actor, row.id);
}

export async function getExpense(actor: Actor, id: string): Promise<ExpenseDetail> {
  const companyId = need(actor);
  const row = await rowOf(companyId, id);
  assertVisible(actor, row);
  const [receipts, categories, profile] = await Promise.all([
    receiptsOf(companyId, id),
    listCategories(companyId),
    getAdminSupabase()
      .from('profiles')
      .select('full_name, email')
      .eq('user_id', row.submitted_by)
      .is('deleted_at', null)
      .limit(1),
  ]);
  const p = profile.data?.[0];
  return {
    ...view(row),
    receipts,
    categoryName: categories.find((c) => c.id === row.category_id)?.name ?? '',
    submitterName: String(p?.full_name || p?.email || ''),
  };
}

export interface ExpenseFilter {
  status?: 'pending' | 'approved' | 'rejected';
  payment?: 'unpaid' | 'paid';
  categoryId?: string;
  from?: string;
  to?: string;
  q?: string;
  limit?: number;
  offset?: number;
}

export async function listExpenses(
  actor: Actor,
  f: ExpenseFilter = {},
): Promise<{ rows: ExpenseView[]; total: number }> {
  const companyId = need(actor);
  let q = getAdminSupabase()
    .from('expenses')
    .select(COLUMNS, { count: 'exact' })
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .order('expense_date', { ascending: false })
    .order('created_at', { ascending: false });
  if (actor.role === 'staff') q = q.eq('submitted_by', actor.userId);
  if (f.status) q = q.eq('status', f.status);
  if (f.payment) q = q.eq('payment_status', f.payment);
  if (f.categoryId) q = q.eq('category_id', f.categoryId);
  if (f.from) q = q.gte('expense_date', f.from);
  if (f.to) q = q.lte('expense_date', f.to);
  if (f.q) {
    const term = f.q
      .replace(/[%_,()]/g, ' ')
      .trim()
      .slice(0, 60);
    if (term) q = q.or(`vendor.ilike.%${term}%,description.ilike.%${term}%`);
  }
  const limit = Math.min(Math.max(f.limit ?? 50, 1), 200);
  const offset = Math.max(f.offset ?? 0, 0);
  const { data, error, count } = await q.range(offset, offset + limit - 1);
  if (error) throw new InternalError(error);
  return { rows: ((data ?? []) as unknown as Row[]).map(view), total: count ?? 0 };
}

/** Changes an expense that is still waiting (or was rejected). The checks run again and it goes back to its approval. */
export async function updateExpense(
  actor: Actor,
  id: string,
  input: unknown,
  options: CreateOptions = {},
): Promise<ExpenseDetail> {
  const companyId = need(actor);
  const parsed = expenseUpdate.safeParse(input);
  if (!parsed.success)
    throw new ValidationError(parsed.error.issues[0]?.message ?? 'The expense is not valid.');
  const row = await rowOf(companyId, id);
  assertVisible(actor, row);
  if (row.status === 'approved') throw new ConflictError('An approved expense cannot be changed.');
  const d = parsed.data.expense;
  const c = await check(
    actor,
    companyId,
    d,
    id,
    options.confirmDuplicate === true,
    row.submitted_by,
    roleOf(actor),
  );
  const category = c.categories.find((x) => x.id === d.categoryId);
  const { data, error } = await getAdminSupabase()
    .from('expenses')
    .update({
      expense_date: d.expenseDate,
      category_id: d.categoryId,
      vendor: d.vendor,
      description: d.description,
      amount_net: d.amountNet,
      tax_amount: d.taxAmount,
      total: c.total.toDbString(),
      reimbursable: d.reimbursable,
      policy_flags: c.violations,
      receipt_hash: c.receipt?.sha256 ?? null,
      duplicate_of: c.duplicateOf,
      tax_deductible: category?.taxDeductible ?? true,
      status: 'pending',
      reject_reason: null,
    })
    .eq('company_id', companyId)
    .eq('id', id)
    .eq('version', parsed.data.version)
    .select(COLUMNS);
  if (error) mapAccountingError(error);
  const updated = (data ?? [])[0] as unknown as Row | undefined;
  if (!updated) throw new ConflictError('Someone else changed this expense. Reload and try again.');
  if (c.receipt && c.receipt.expenseId !== id) {
    const link = await getAdminSupabase()
      .from('receipts')
      .update({ expense_id: id })
      .eq('id', c.receipt.id)
      .eq('company_id', companyId)
      .is('expense_id', null);
    if (link.error) throw new InternalError(link.error);
  }
  await audit(companyId, 'expense.changed', id, { total: c.total.toDbString() });
  return getExpense(actor, id);
}

export async function deleteExpense(actor: Actor, id: string): Promise<void> {
  const companyId = need(actor);
  const row = await rowOf(companyId, id);
  assertVisible(actor, row);
  if (row.status === 'approved') throw new ConflictError('An approved expense cannot be deleted.');
  const { error } = await getAdminSupabase()
    .from('expenses')
    .update({ deleted_at: new Date().toISOString() })
    .eq('company_id', companyId)
    .eq('id', id)
    .neq('status', 'approved');
  if (error) mapAccountingError(error);
  await audit(companyId, 'expense.deleted', id, {});
}

/** The owner approves or rejects an expense that waits. A breached policy needs an override reason to approve. */
export async function decideExpense(
  actor: Actor,
  id: string,
  input: unknown,
): Promise<ExpenseDetail> {
  const companyId = need(actor);
  if (actor.role === 'staff') throw new ForbiddenError();
  const parsed = decideInput.safeParse(input);
  if (!parsed.success)
    throw new ValidationError(parsed.error.issues[0]?.message ?? 'The decision is not valid.');
  const d = parsed.data;
  const row = await rowOf(companyId, id);
  if (row.status !== 'pending')
    throw new ConflictError('This expense is not waiting for a decision.');
  if (
    d.decision === 'approve' &&
    row.policy_flags.length > 0 &&
    d.overrideReason.trim().length < 10
  )
    throw new ValidationError(
      'A policy was breached. Give a reason of at least 10 characters to approve it.',
    );
  if (row.approval_request_id)
    await getService('approval').decide(row.approval_request_id, {
      approverId: actor.userId,
      decision: d.decision,
      reason: d.reason || null,
    });
  const now = new Date().toISOString();
  const admin = getAdminSupabase();
  const { data, error } = await admin
    .from('expenses')
    .update(
      d.decision === 'approve'
        ? {
            status: 'approved',
            decided_by: actor.userId,
            decided_at: now,
            override_reason: d.overrideReason.trim() || null,
          }
        : {
            status: 'rejected',
            decided_by: actor.userId,
            decided_at: now,
            reject_reason: d.reason,
          },
    )
    .eq('company_id', companyId)
    .eq('id', id)
    .eq('status', 'pending')
    .select(COLUMNS);
  if (error) mapAccountingError(error);
  const updated = (data ?? [])[0] as unknown as Row | undefined;
  if (!updated) throw new ConflictError('Someone else decided this expense.');
  if (d.decision === 'approve')
    await publishExpense(updated, companyId, await listCategories(companyId)).catch((e: unknown) =>
      log.error('expense event not published', { id, error: String(e) }),
    );
  await audit(companyId, d.decision === 'approve' ? 'expense.approved' : 'expense.rejected', id, {
    reason: d.reason,
    override: d.overrideReason,
  });
  await tell(
    companyId,
    row.submitted_by,
    d.decision === 'approve' ? 'expense.approved' : 'expense.rejected',
    d.decision === 'approve' ? 'Your expense was approved' : 'Your expense was rejected',
    d.reason || `${m(row.total)} USD`,
  );
  return getExpense(actor, id);
}

/** Books the payment of an approved expense that was owed (to the vendor, or back to the employee who paid it). */
export async function markPaid(actor: Actor, id: string, input: unknown): Promise<ExpenseDetail> {
  const companyId = need(actor);
  const parsed = paidInput.safeParse(input);
  if (!parsed.success)
    throw new ValidationError(parsed.error.issues[0]?.message ?? 'The payment is not valid.');
  const row = await rowOf(companyId, id);
  if (row.status !== 'approved') throw new ConflictError('Only an approved expense can be paid.');
  if (row.payment_status === 'paid') return getExpense(actor, id);
  const today = new Date().toISOString().slice(0, 10);
  const [payable, bank] = await Promise.all([
    resolveAccount(companyId, 'accounts_payable'),
    resolveAccount(companyId, 'bank'),
  ]);
  const total = m(row.total);
  await postSystemEntry({
    companyId,
    date: today,
    memo: `Payment of expense ${row.vendor || row.description || row.id.slice(0, 8)}`.slice(0, 500),
    sourceType: 'expense',
    sourceId: id,
    sourceKey: `expense:${id}:paid`,
    lines: [
      { accountId: payable, debit: total, credit: '0', description: 'Expense paid' },
      { accountId: bank, debit: '0', credit: total, description: 'Expense paid' },
    ],
  });
  const { error } = await getAdminSupabase()
    .from('expenses')
    .update({
      payment_status: 'paid',
      paid_at: new Date().toISOString(),
      paid_via: parsed.data.paidVia,
      paid_reference: parsed.data.reference || null,
    })
    .eq('company_id', companyId)
    .eq('id', id)
    .eq('payment_status', 'unpaid');
  if (error) mapAccountingError(error);
  await audit(companyId, 'expense.paid', id, { via: parsed.data.paidVia });
  return getExpense(actor, id);
}

/** Job: approved expenses whose event was not published (for example the event store was down) are published again. */
export async function republishUnbooked(): Promise<number> {
  const { data, error } = await getAdminSupabase()
    .from('expenses')
    .select(`${COLUMNS}, company_id`)
    .eq('status', 'approved')
    .is('event_published_at', null)
    .is('deleted_at', null)
    .limit(500);
  if (error) throw new InternalError(error);
  let n = 0;
  const cache = new Map<string, CategoryView[]>();
  for (const raw of (data ?? []) as unknown as (Row & { company_id: string })[]) {
    try {
      const cats = cache.get(raw.company_id) ?? (await listCategories(raw.company_id));
      cache.set(raw.company_id, cats);
      await publishExpense(raw, raw.company_id, cats);
      n += 1;
    } catch (e) {
      log.error('republish failed', { id: raw.id, error: String(e) });
    }
  }
  return n;
}
