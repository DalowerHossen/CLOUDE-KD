// path: services/expense/recurring.ts
// Recurring expenses (rent, subscriptions, insurance). A daily job makes an ordinary approved expense for each due date; the
// database allows one expense per recurring item and date, so a job that runs twice makes it once. The expenses made are the
// history of the item. A run that fails keeps its reason on the item and the owner is told.
import 'server-only';
import { getService } from '@/lib/container';
import { InternalError, NotFoundError, ValidationError } from '@/lib/errors';
import { createLogger } from '@/lib/logger';
import { toInt } from '@/lib/reports/numbers';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { Money } from '@/lib/utils/currency';
import type { Actor } from '@/types/contracts';
import { mapAccountingError } from '@/services/accounting/db-errors';
import { dueDates, nextRun } from '@/services/accounting/period-rules';
import { listCategories } from './categories';
import { recurringExpenseInput, totalOf } from './expense-rules';
import { publishExpense } from './expenses';

const log = createLogger({ component: 'expense-recurring' });

export interface RecurringExpenseView {
  id: string;
  name: string;
  categoryId: string | null;
  vendor: string;
  amountNet: string;
  taxAmount: string;
  frequency: 'monthly' | 'quarterly' | 'yearly';
  dayOfMonth: number;
  nextRun: string;
  endDate: string | null;
  paid: boolean;
  status: 'active' | 'paused' | 'finished';
  runCount: number;
  lastRun: string | null;
  lastError: string | null;
}

const COLUMNS =
  'id, name, category_id, vendor, description, amount_net, tax_amount, frequency, day_of_month, next_run, end_date, paid, status, run_count, last_run, last_error';

interface Row {
  id: string;
  name: string;
  category_id: string | null;
  vendor: string;
  description: string;
  amount_net: string | number;
  tax_amount: string | number;
  frequency: string;
  day_of_month: number;
  next_run: string;
  end_date: string | null;
  paid: boolean;
  status: string;
  run_count: number;
  last_run: string | null;
  last_error: string | null;
}

const view = (r: Row): RecurringExpenseView => ({
  id: r.id,
  name: r.name,
  categoryId: r.category_id,
  vendor: r.vendor,
  amountNet: Money.parseRounded(String(r.amount_net)).toDbString(),
  taxAmount: Money.parseRounded(String(r.tax_amount)).toDbString(),
  frequency:
    r.frequency === 'yearly' ? 'yearly' : r.frequency === 'quarterly' ? 'quarterly' : 'monthly',
  dayOfMonth: toInt(r.day_of_month),
  nextRun: String(r.next_run),
  endDate: r.end_date ? String(r.end_date) : null,
  paid: r.paid,
  status: r.status === 'paused' ? 'paused' : r.status === 'finished' ? 'finished' : 'active',
  runCount: toInt(r.run_count),
  lastRun: r.last_run ? String(r.last_run) : null,
  lastError: r.last_error,
});

export async function listRecurringExpenses(companyId: string): Promise<RecurringExpenseView[]> {
  const { data, error } = await getAdminSupabase()
    .from('recurring_expenses')
    .select(COLUMNS)
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .order('next_run', { ascending: true })
    .limit(200);
  if (error) throw new InternalError(error);
  return ((data ?? []) as unknown as Row[]).map(view);
}

export async function createRecurringExpense(
  actor: Actor,
  input: unknown,
): Promise<RecurringExpenseView> {
  const companyId = actor.companyId;
  if (!companyId) throw new ValidationError('A company is needed.');
  const parsed = recurringExpenseInput.safeParse(input);
  if (!parsed.success)
    throw new ValidationError(
      parsed.error.issues[0]?.message ?? 'The recurring expense is not valid.',
    );
  const d = parsed.data;
  const { data, error } = await getAdminSupabase()
    .from('recurring_expenses')
    .insert({
      company_id: companyId,
      name: d.name,
      category_id: d.categoryId,
      vendor: d.vendor,
      description: d.description,
      amount_net: d.amountNet,
      tax_amount: d.taxAmount,
      frequency: d.frequency,
      day_of_month: d.dayOfMonth,
      next_run: d.firstRun,
      end_date: d.endDate,
      paid: d.paid,
      created_by: actor.userId,
    })
    .select(COLUMNS)
    .single();
  if (error) mapAccountingError(error);
  const created = view(data as unknown as Row);
  await getService('audit').record({
    action: 'expense.recurring_created',
    resourceType: 'recurring_expense',
    resourceId: created.id,
    companyId,
    metadata: { name: d.name },
  });
  return created;
}

export async function setRecurringExpenseStatus(
  actor: Actor,
  id: string,
  status: 'active' | 'paused',
): Promise<RecurringExpenseView> {
  const companyId = actor.companyId;
  if (!companyId) throw new ValidationError('A company is needed.');
  const { data, error } = await getAdminSupabase()
    .from('recurring_expenses')
    .update({ status })
    .eq('company_id', companyId)
    .eq('id', id)
    .neq('status', 'finished')
    .is('deleted_at', null)
    .select(COLUMNS);
  if (error) mapAccountingError(error);
  const row = (data ?? [])[0] as unknown as Row | undefined;
  if (!row) throw new NotFoundError();
  await getService('audit').record({
    action: `expense.recurring_${status}`,
    resourceType: 'recurring_expense',
    resourceId: id,
    companyId,
    metadata: {},
  });
  return view(row);
}

export async function removeRecurringExpense(actor: Actor, id: string): Promise<void> {
  const companyId = actor.companyId;
  if (!companyId) throw new ValidationError('A company is needed.');
  const { data, error } = await getAdminSupabase()
    .from('recurring_expenses')
    .update({ deleted_at: new Date().toISOString() })
    .eq('company_id', companyId)
    .eq('id', id)
    .is('deleted_at', null)
    .select('id');
  if (error) mapAccountingError(error);
  if (!data || data.length === 0) throw new NotFoundError();
  await getService('audit').record({
    action: 'expense.recurring_removed',
    resourceType: 'recurring_expense',
    resourceId: id,
    companyId,
    metadata: {},
  });
}

/** The history of a recurring item: the expenses it made. */
export async function recurringHistory(
  companyId: string,
  id: string,
): Promise<{ id: string; date: string; total: string; status: string }[]> {
  const { data, error } = await getAdminSupabase()
    .from('expenses')
    .select('id, expense_date, total, status')
    .eq('company_id', companyId)
    .eq('recurring_id', id)
    .is('deleted_at', null)
    .order('expense_date', { ascending: false })
    .limit(100);
  if (error) throw new InternalError(error);
  return (data ?? []).map((r) => ({
    id: String(r.id),
    date: String(r.expense_date),
    total: Money.parseRounded(String(r.total)).toDbString(),
    status: String(r.status),
  }));
}

export interface ExpenseRunResult {
  checked: number;
  made: number;
  failed: number;
}

/** Job: makes the expenses that are due (an owner approved the item when they set it up, so these are approved at once). */
export async function runDueRecurringExpenses(
  today: string = new Date().toISOString().slice(0, 10),
): Promise<ExpenseRunResult> {
  const admin = getAdminSupabase();
  const { data, error } = await admin
    .from('recurring_expenses')
    .select(`${COLUMNS}, company_id, created_by`)
    .eq('status', 'active')
    .is('deleted_at', null)
    .lte('next_run', today)
    .limit(1000);
  if (error) throw new InternalError(error);
  const out: ExpenseRunResult = { checked: 0, made: 0, failed: 0 };
  for (const raw of (data ?? []) as unknown as (Row & {
    company_id: string;
    created_by: string | null;
  })[]) {
    out.checked += 1;
    const rec = view(raw);
    let next = rec.nextRun;
    let runs = rec.runCount;
    let lastRun = rec.lastRun;
    let lastError: string | null = null;
    const categories = await listCategories(raw.company_id);
    const category = categories.find((c) => c.id === rec.categoryId);
    for (const day of dueDates(rec.nextRun, today, rec.frequency, rec.dayOfMonth, rec.endDate)) {
      const now = new Date().toISOString();
      const { data: made, error: e } = await admin
        .from('expenses')
        .insert({
          company_id: raw.company_id,
          expense_date: day,
          category_id: rec.categoryId,
          vendor: rec.vendor,
          description: raw.description,
          amount_net: rec.amountNet,
          tax_amount: rec.taxAmount,
          total: totalOf(rec.amountNet, rec.taxAmount).toDbString(),
          status: 'approved',
          decided_by: raw.created_by,
          decided_at: now,
          payment_status: rec.paid ? 'paid' : 'unpaid',
          paid_at: rec.paid ? now : null,
          paid_via: rec.paid ? 'bank' : null,
          submitted_by: raw.created_by ?? '00000000-0000-0000-0000-000000000000',
          recurring_id: rec.id,
          tax_deductible: category?.taxDeductible ?? true,
        })
        .select(
          'id, expense_date, category_id, vendor, description, amount_net, tax_amount, payment_status',
        )
        .single();
      if (e && e.code !== '23505') {
        lastError = e.message.slice(0, 500);
        log.error('recurring expense failed', { id: rec.id, day, error: lastError });
        out.failed += 1;
        break;
      }
      if (made) {
        out.made += 1;
        await publishExpense(
          made as unknown as Parameters<typeof publishExpense>[0],
          raw.company_id,
          categories,
        ).catch((x: unknown) => log.error('event not published', { id: rec.id, error: String(x) }));
      }
      runs += 1;
      lastRun = day;
      next = nextRun(day, rec.frequency, rec.dayOfMonth);
    }
    const finished = rec.endDate !== null && next > rec.endDate;
    const up = await admin
      .from('recurring_expenses')
      .update({
        next_run: next,
        run_count: runs,
        last_run: lastRun,
        last_error: lastError,
        status: finished ? 'finished' : 'active',
      })
      .eq('id', rec.id);
    if (up.error) log.error('recurring state not saved', { id: rec.id, error: up.error.message });
    if (lastError) {
      try {
        await getService('notification').notify({
          companyId: raw.company_id,
          type: 'expense.recurring_failed',
          title: 'A recurring expense could not be made',
          body: `${rec.name}: ${lastError}`.slice(0, 200),
          href: '/expenses/recurring',
        });
      } catch {
        // The failure stays on the item for the owner to see.
      }
    }
  }
  return out;
}
