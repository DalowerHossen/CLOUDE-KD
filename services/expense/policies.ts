// path: services/expense/policies.ts
// Expense policies: limits per expense, day and month, a receipt rule, auto-approval of small expenses, and what a breach
// does (flag it for the owner, or block it). A policy can cover one category (and the ones below it) and one role.
import 'server-only';
import { getService } from '@/lib/container';
import { InternalError, NotFoundError, ValidationError } from '@/lib/errors';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { Money } from '@/lib/utils/currency';
import type { Actor } from '@/types/contracts';
import { mapAccountingError } from '@/services/accounting/db-errors';
import { policyInput, type Policy } from './expense-rules';

const COLUMNS =
  'id, name, category_id, role, max_per_expense, max_per_day, max_per_month, receipt_required_above, auto_approve_below, breach_action, status';

interface Row {
  id: string;
  name: string;
  category_id: string | null;
  role: string | null;
  max_per_expense: string | number | null;
  max_per_day: string | number | null;
  max_per_month: string | number | null;
  receipt_required_above: string | number | null;
  auto_approve_below: string | number | null;
  breach_action: string;
  status: string;
}

const money = (v: string | number | null): string | null =>
  v === null ? null : Money.parseRounded(String(v)).toDbString();

const view = (r: Row): Policy => ({
  id: r.id,
  name: r.name,
  categoryId: r.category_id,
  role: r.role === 'owner' ? 'owner' : r.role === 'staff' ? 'staff' : null,
  maxPerExpense: money(r.max_per_expense),
  maxPerDay: money(r.max_per_day),
  maxPerMonth: money(r.max_per_month),
  receiptRequiredAbove: money(r.receipt_required_above),
  autoApproveBelow: money(r.auto_approve_below),
  breachAction: r.breach_action === 'block' ? 'block' : 'flag',
  status: r.status === 'inactive' ? 'inactive' : 'active',
});

export async function listPolicies(companyId: string): Promise<Policy[]> {
  const { data, error } = await getAdminSupabase()
    .from('expense_policies')
    .select(COLUMNS)
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .order('name', { ascending: true })
    .limit(200);
  if (error) throw new InternalError(error);
  return ((data ?? []) as unknown as Row[]).map(view);
}

export async function createPolicy(actor: Actor, input: unknown): Promise<Policy> {
  const companyId = actor.companyId;
  if (!companyId) throw new ValidationError('A company is needed.');
  const parsed = policyInput.safeParse(input);
  if (!parsed.success)
    throw new ValidationError(parsed.error.issues[0]?.message ?? 'The policy is not valid.');
  const d = parsed.data;
  const { data, error } = await getAdminSupabase()
    .from('expense_policies')
    .insert({
      company_id: companyId,
      name: d.name,
      category_id: d.categoryId,
      role: d.role,
      max_per_expense: d.maxPerExpense,
      max_per_day: d.maxPerDay,
      max_per_month: d.maxPerMonth,
      receipt_required_above: d.receiptRequiredAbove,
      auto_approve_below: d.autoApproveBelow,
      breach_action: d.breachAction,
    })
    .select(COLUMNS)
    .single();
  if (error) mapAccountingError(error);
  const created = view(data as unknown as Row);
  await getService('audit').record({
    action: 'expense.policy_created',
    resourceType: 'expense_policy',
    resourceId: created.id,
    companyId,
    metadata: { name: d.name },
  });
  return created;
}

export async function setPolicyStatus(
  actor: Actor,
  id: string,
  status: 'active' | 'inactive',
): Promise<Policy> {
  const companyId = actor.companyId;
  if (!companyId) throw new ValidationError('A company is needed.');
  const { data, error } = await getAdminSupabase()
    .from('expense_policies')
    .update({ status })
    .eq('company_id', companyId)
    .eq('id', id)
    .is('deleted_at', null)
    .select(COLUMNS);
  if (error) mapAccountingError(error);
  const row = (data ?? [])[0] as unknown as Row | undefined;
  if (!row) throw new NotFoundError();
  await getService('audit').record({
    action: 'expense.policy_changed',
    resourceType: 'expense_policy',
    resourceId: id,
    companyId,
    metadata: { status },
  });
  return view(row);
}

export async function removePolicy(actor: Actor, id: string): Promise<void> {
  const companyId = actor.companyId;
  if (!companyId) throw new ValidationError('A company is needed.');
  const { data, error } = await getAdminSupabase()
    .from('expense_policies')
    .update({ deleted_at: new Date().toISOString() })
    .eq('company_id', companyId)
    .eq('id', id)
    .is('deleted_at', null)
    .select('id');
  if (error) mapAccountingError(error);
  if (!data || data.length === 0) throw new NotFoundError();
  await getService('audit').record({
    action: 'expense.policy_removed',
    resourceType: 'expense_policy',
    resourceId: id,
    companyId,
    metadata: {},
  });
}
