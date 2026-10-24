// path: services/budget/budgets.ts
// Budgets: a twelve month plan of revenue and expense per account. A draft is edited (monthly, quarterly or yearly amounts, copied
// from last year with a change in percent), submitted, and the owner approves it through the approval service; an approved budget
// can be locked at period end or revised (a revision is a new draft that replaces the approved one when it is approved).
import 'server-only';
import { getService } from '@/lib/container';
import {
  ConflictError,
  ForbiddenError,
  InternalError,
  NotFoundError,
  ValidationError,
} from '@/lib/errors';
import { getAdminSupabase } from '@/lib/supabase/admin';
import type { Actor } from '@/types/contracts';
import { listAccounts } from '@/services/accounting/accounts';
import { mapAccountingError } from '@/services/accounting/db-errors';
import { addMonthsToDay } from '@/services/accounting/period-rules';
import {
  budgetInput,
  budgetUpdate,
  copyCells,
  copyInput,
  decideInput,
  lineInput,
  monthsOf,
  spread,
  type BudgetAccount,
  type BudgetCell,
  type PeriodKind,
} from './budget-rules';
import { Money } from '@/lib/utils/currency';
import { toInt } from '@/lib/reports/numbers';

export const BUDGET_APPROVAL_ACTION = 'budget.approve';

export type BudgetStatus = 'draft' | 'pending_approval' | 'approved' | 'locked' | 'superseded';

export interface BudgetView {
  id: string;
  name: string;
  fiscalYearStart: string;
  periodKind: PeriodKind;
  status: BudgetStatus;
  revision: number;
  revisionOf: string | null;
  note: string;
  approvedAt: string | null;
  version: number;
}

const COLUMNS =
  'id, name, fiscal_year_start, period_kind, status, revision, revision_of, note, approved_at, approval_request_id, version';

interface Row {
  id: string;
  name: string;
  fiscal_year_start: string;
  period_kind: string;
  status: string;
  revision: number;
  revision_of: string | null;
  note: string;
  approved_at: string | null;
  approval_request_id: string | null;
  version: number;
}

const kind = (v: string): PeriodKind => (v === 'quarterly' || v === 'yearly' ? v : 'monthly');
const status = (v: string): BudgetStatus =>
  v === 'pending_approval' || v === 'approved' || v === 'locked' || v === 'superseded'
    ? v
    : 'draft';

const view = (r: Row): BudgetView => ({
  id: r.id,
  name: r.name,
  fiscalYearStart: String(r.fiscal_year_start),
  periodKind: kind(r.period_kind),
  status: status(r.status),
  revision: toInt(r.revision),
  revisionOf: r.revision_of,
  note: r.note,
  approvedAt: r.approved_at,
  version: r.version,
});

const need = (actor: Actor): string => {
  if (!actor.companyId) throw new ValidationError('A company is needed.');
  return actor.companyId;
};

async function audit(
  companyId: string,
  action: string,
  id: string,
  metadata: Record<string, unknown>,
): Promise<void> {
  await getService('audit').record({
    action,
    resourceType: 'budget',
    resourceId: id,
    companyId,
    metadata,
  });
}

export async function listBudgets(companyId: string): Promise<BudgetView[]> {
  const { data, error } = await getAdminSupabase()
    .from('budgets')
    .select(COLUMNS)
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .order('fiscal_year_start', { ascending: false })
    .order('revision', { ascending: false })
    .limit(500);
  if (error) throw new InternalError(error);
  return ((data ?? []) as unknown as Row[]).map(view);
}

async function rowOf(companyId: string, id: string): Promise<Row> {
  const { data, error } = await getAdminSupabase()
    .from('budgets')
    .select(COLUMNS)
    .eq('company_id', companyId)
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw new InternalError(error);
  if (!data) throw new NotFoundError();
  return data as unknown as Row;
}

export async function getBudget(companyId: string, id: string): Promise<BudgetView> {
  return view(await rowOf(companyId, id));
}

export async function cellsOf(companyId: string, budgetId: string): Promise<BudgetCell[]> {
  const { data, error } = await getAdminSupabase()
    .from('budget_lines')
    .select('account_id, month, amount')
    .eq('company_id', companyId)
    .eq('budget_id', budgetId)
    .is('deleted_at', null)
    .limit(20_000);
  if (error) throw new InternalError(error);
  return (data ?? []).map((r) => ({
    accountId: String(r.account_id),
    month: String(r.month),
    amount: Money.parseRounded(String(r.amount)).toDbString(),
  }));
}

/** Accounts a budget can use: revenue and expense accounts that accept postings. */
export async function budgetAccounts(companyId: string): Promise<BudgetAccount[]> {
  return (await listAccounts(companyId, { status: 'active' }))
    .filter((a) => a.allowPosting && (a.type === 'revenue' || a.type === 'expense'))
    .map((a) => ({ id: a.id, code: a.code, name: a.name, type: a.type as 'revenue' | 'expense' }));
}

export async function createBudget(actor: Actor, input: unknown): Promise<BudgetView> {
  const companyId = need(actor);
  const parsed = budgetInput.safeParse(input);
  if (!parsed.success)
    throw new ValidationError(parsed.error.issues[0]?.message ?? 'The budget is not valid.');
  const d = parsed.data;
  const { data, error } = await getAdminSupabase()
    .from('budgets')
    .insert({
      company_id: companyId,
      name: d.name,
      fiscal_year_start: d.fiscalYearStart,
      period_kind: d.periodKind,
      note: d.note,
      created_by: actor.userId,
    })
    .select(COLUMNS)
    .single();
  if (error) mapAccountingError(error);
  const created = view(data as unknown as Row);
  await audit(companyId, 'budget.created', created.id, { name: d.name, year: d.fiscalYearStart });
  return created;
}

export async function updateBudget(actor: Actor, id: string, input: unknown): Promise<BudgetView> {
  const companyId = need(actor);
  const parsed = budgetUpdate.safeParse(input);
  if (!parsed.success)
    throw new ValidationError(parsed.error.issues[0]?.message ?? 'The change is not valid.');
  const d = parsed.data;
  const patch: Record<string, unknown> = {};
  if (d.name !== undefined) patch.name = d.name;
  if (d.periodKind !== undefined) patch.period_kind = d.periodKind;
  if (d.note !== undefined) patch.note = d.note;
  const { data, error } = await getAdminSupabase()
    .from('budgets')
    .update(patch)
    .eq('company_id', companyId)
    .eq('id', id)
    .eq('version', d.version)
    .eq('status', 'draft')
    .is('deleted_at', null)
    .select(COLUMNS);
  if (error) mapAccountingError(error);
  const row = (data ?? [])[0] as unknown as Row | undefined;
  if (!row) throw new ConflictError('The budget changed or is no longer a draft.');
  await audit(companyId, 'budget.changed', id, { fields: Object.keys(patch) });
  return view(row);
}

export async function deleteDraft(actor: Actor, id: string): Promise<void> {
  const companyId = need(actor);
  const row = await rowOf(companyId, id);
  if (row.status !== 'draft') throw new ConflictError('Only a draft can be removed.');
  const now = new Date().toISOString();
  const admin = getAdminSupabase();
  const lines = await admin
    .from('budget_lines')
    .update({ deleted_at: now })
    .eq('budget_id', id)
    .is('deleted_at', null);
  if (lines.error) mapAccountingError(lines.error);
  const { error } = await admin
    .from('budgets')
    .update({ deleted_at: now })
    .eq('id', id)
    .eq('status', 'draft');
  if (error) mapAccountingError(error);
  await audit(companyId, 'budget.deleted', id, {});
}

/** Sets the amounts of one account in a draft budget. All zero removes the account from the budget. */
export async function setLine(actor: Actor, budgetId: string, input: unknown): Promise<void> {
  const companyId = need(actor);
  const parsed = lineInput.safeParse(input);
  if (!parsed.success)
    throw new ValidationError(parsed.error.issues[0]?.message ?? 'The amounts are not valid.');
  const budget = await rowOf(companyId, budgetId);
  if (budget.status !== 'draft') throw new ConflictError('Only a draft budget can change.');
  const months = spread(kind(budget.period_kind), parsed.data.amounts);
  if (!months)
    throw new ValidationError(
      `This budget takes ${kind(budget.period_kind) === 'monthly' ? '12 monthly' : kind(budget.period_kind) === 'quarterly' ? '4 quarterly' : '1 yearly'} amount(s).`,
    );
  const admin = getAdminSupabase();
  const existing = await admin
    .from('budget_lines')
    .select('id, month, version')
    .eq('budget_id', budgetId)
    .eq('account_id', parsed.data.accountId)
    .is('deleted_at', null);
  if (existing.error) throw new InternalError(existing.error);
  const byMonth = new Map((existing.data ?? []).map((r) => [String(r.month), r]));
  const dates = monthsOf(String(budget.fiscal_year_start));
  const allZero = months.every((m) => m.isZero());
  for (const [i, month] of dates.entries()) {
    const amount = months[i] ?? Money.zero();
    const cur = byMonth.get(month);
    if (allZero) {
      if (cur) {
        const r = await admin
          .from('budget_lines')
          .update({ deleted_at: new Date().toISOString() })
          .eq('id', cur.id);
        if (r.error) mapAccountingError(r.error);
      }
      continue;
    }
    const r = cur
      ? await admin.from('budget_lines').update({ amount: amount.toDbString() }).eq('id', cur.id)
      : await admin.from('budget_lines').insert({
          company_id: companyId,
          budget_id: budgetId,
          account_id: parsed.data.accountId,
          month,
          amount: amount.toDbString(),
        });
    if (r.error) mapAccountingError(r.error);
  }
  await audit(companyId, 'budget.line_set', budgetId, { accountId: parsed.data.accountId });
}

/** A new draft from an existing budget, shifted to another year and changed by a percent (copy from last year). */
export async function copyBudget(actor: Actor, input: unknown): Promise<BudgetView> {
  const companyId = need(actor);
  const parsed = copyInput.safeParse(input);
  if (!parsed.success)
    throw new ValidationError(parsed.error.issues[0]?.message ?? 'The copy is not valid.');
  const d = parsed.data;
  const source = await rowOf(companyId, d.sourceBudgetId);
  const shift = monthsBetweenDays(String(source.fiscal_year_start), d.fiscalYearStart);
  const created = await createBudget(actor, {
    name: d.name,
    fiscalYearStart: d.fiscalYearStart,
    periodKind: 'monthly',
    note: `Copied from ${source.name}${d.adjustPercent !== '0' ? ` with ${d.adjustPercent} percent` : ''}.`,
  });
  await writeCells(
    companyId,
    created.id,
    copyCells(await cellsOf(companyId, source.id), shift, d.adjustPercent),
  );
  await audit(companyId, 'budget.copied', created.id, {
    from: source.id,
    percent: d.adjustPercent,
  });
  return created;
}

function monthsBetweenDays(from: string, to: string): number {
  return (
    (Number(to.slice(0, 4)) - Number(from.slice(0, 4))) * 12 +
    Number(to.slice(5, 7)) -
    Number(from.slice(5, 7))
  );
}

async function writeCells(
  companyId: string,
  budgetId: string,
  cells: readonly BudgetCell[],
): Promise<void> {
  if (cells.length === 0) return;
  const { error } = await getAdminSupabase()
    .from('budget_lines')
    .insert(
      cells.map((c) => ({
        company_id: companyId,
        budget_id: budgetId,
        account_id: c.accountId,
        month: c.month,
        amount: c.amount,
      })),
    );
  if (error) mapAccountingError(error);
}

export async function submitBudget(actor: Actor, id: string): Promise<BudgetView> {
  const companyId = need(actor);
  const row = await rowOf(companyId, id);
  if (row.status !== 'draft') throw new ConflictError('Only a draft can be submitted.');
  if ((await cellsOf(companyId, id)).length === 0)
    throw new ValidationError('Add at least one account to the budget first.');
  const state = await getService('approval').request({
    action: BUDGET_APPROVAL_ACTION,
    payload: { budgetId: id },
    requesterId: actor.userId,
    companyId,
  });
  const { data, error } = await getAdminSupabase()
    .from('budgets')
    .update({ status: 'pending_approval', approval_request_id: state.requestId })
    .eq('company_id', companyId)
    .eq('id', id)
    .eq('status', 'draft')
    .select(COLUMNS);
  if (error) mapAccountingError(error);
  const updated = (data ?? [])[0] as unknown as Row | undefined;
  if (!updated) throw new ConflictError('Someone else changed this budget.');
  await audit(companyId, 'budget.submitted', id, {});
  return view(updated);
}

/** The owner approves or rejects a submitted budget. An approved revision replaces the budget it revises. */
export async function decideBudget(actor: Actor, id: string, input: unknown): Promise<BudgetView> {
  const companyId = need(actor);
  if (actor.role === 'staff') throw new ForbiddenError();
  const parsed = decideInput.safeParse(input);
  if (!parsed.success)
    throw new ValidationError(parsed.error.issues[0]?.message ?? 'The decision is not valid.');
  const d = parsed.data;
  const row = await rowOf(companyId, id);
  if (row.status !== 'pending_approval')
    throw new ConflictError('This budget is not waiting for a decision.');
  if (row.approval_request_id)
    await getService('approval').decide(row.approval_request_id, {
      approverId: actor.userId,
      decision: d.decision,
      reason: d.reason || null,
    });
  const admin = getAdminSupabase();
  if (d.decision === 'reject') {
    const r = await admin
      .from('budgets')
      .update({
        status: 'draft',
        note: d.reason ? `Rejected: ${d.reason}`.slice(0, 500) : row.note,
      })
      .eq('id', id)
      .eq('status', 'pending_approval')
      .select(COLUMNS);
    if (r.error) mapAccountingError(r.error);
    await audit(companyId, 'budget.rejected', id, { reason: d.reason });
    return view((r.data ?? [])[0] as unknown as Row);
  }
  // The live budget of the year (the one this revises, or any other) makes room first.
  const live = await admin
    .from('budgets')
    .select('id, status')
    .eq('company_id', companyId)
    .eq('fiscal_year_start', row.fiscal_year_start)
    .eq('status', 'approved')
    .neq('id', id)
    .is('deleted_at', null);
  if (live.error) throw new InternalError(live.error);
  for (const l of live.data ?? []) {
    const s = await admin
      .from('budgets')
      .update({ status: 'superseded' })
      .eq('id', l.id)
      .eq('status', 'approved');
    if (s.error) mapAccountingError(s.error);
  }
  const { data, error } = await admin
    .from('budgets')
    .update({
      status: 'approved',
      approved_by: actor.userId,
      approved_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('status', 'pending_approval')
    .select(COLUMNS);
  if (error) {
    if (error.code === '23505')
      throw new ConflictError('A locked budget already covers this year.');
    mapAccountingError(error);
  }
  const updated = (data ?? [])[0] as unknown as Row | undefined;
  if (!updated) throw new ConflictError('Someone else decided this budget.');
  await audit(companyId, 'budget.approved', id, { replaced: (live.data ?? []).length });
  return view(updated);
}

/** Locks an approved budget at period end: nothing about it can change and it cannot be revised. */
export async function lockBudget(actor: Actor, id: string): Promise<BudgetView> {
  const companyId = need(actor);
  const row = await rowOf(companyId, id);
  if (row.status !== 'approved') throw new ConflictError('Only an approved budget can be locked.');
  const { data, error } = await getAdminSupabase()
    .from('budgets')
    .update({ status: 'locked' })
    .eq('company_id', companyId)
    .eq('id', id)
    .eq('status', 'approved')
    .select(COLUMNS);
  if (error) mapAccountingError(error);
  const updated = (data ?? [])[0] as unknown as Row | undefined;
  if (!updated) throw new ConflictError('Someone else changed this budget.');
  await audit(companyId, 'budget.locked', id, {});
  return view(updated);
}

/** A mid-year adjustment: a new draft with the amounts of the approved budget; it replaces that budget when it is approved. */
export async function reviseBudget(actor: Actor, id: string): Promise<BudgetView> {
  const companyId = need(actor);
  const row = await rowOf(companyId, id);
  if (row.status !== 'approved') throw new ConflictError('Only an approved budget can be revised.');
  const open = await getAdminSupabase()
    .from('budgets')
    .select('id')
    .eq('company_id', companyId)
    .eq('revision_of', id)
    .in('status', ['draft', 'pending_approval'])
    .is('deleted_at', null)
    .limit(1);
  if (open.error) throw new InternalError(open.error);
  if ((open.data ?? []).length > 0)
    throw new ConflictError('This budget already has a revision in progress.');
  const { data, error } = await getAdminSupabase()
    .from('budgets')
    .insert({
      company_id: companyId,
      name: row.name,
      fiscal_year_start: row.fiscal_year_start,
      period_kind: 'monthly',
      revision: toInt(row.revision) + 1,
      revision_of: id,
      note: `Revision of ${row.name}.`,
      created_by: actor.userId,
    })
    .select(COLUMNS)
    .single();
  if (error) mapAccountingError(error);
  const created = view(data as unknown as Row);
  await writeCells(companyId, created.id, await cellsOf(companyId, id));
  await audit(companyId, 'budget.revised', created.id, { of: id, revision: created.revision });
  return created;
}

/** The budget that counts for a date: the approved or locked one of its year. */
export async function liveBudgetFor(companyId: string, day: string): Promise<BudgetView | null> {
  const { data, error } = await getAdminSupabase()
    .from('budgets')
    .select(COLUMNS)
    .eq('company_id', companyId)
    .in('status', ['approved', 'locked'])
    .lte('fiscal_year_start', day)
    .gt('fiscal_year_start', addMonthsToDay(day, -12))
    .is('deleted_at', null)
    .order('fiscal_year_start', { ascending: false })
    .limit(1);
  if (error) throw new InternalError(error);
  const row = (data ?? [])[0] as unknown as Row | undefined;
  return row ? view(row) : null;
}
