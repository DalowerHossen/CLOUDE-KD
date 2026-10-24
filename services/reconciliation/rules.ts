// path: services/reconciliation/rules.ts
// Bank rules: when a bank line's text contains the words of a rule, the line is booked to the rule's account at import (bank
// fees, interest, card charges). Rules run in the order they were made.
import 'server-only';
import { getService } from '@/lib/container';
import { InternalError, NotFoundError, ValidationError } from '@/lib/errors';
import { getAdminSupabase } from '@/lib/supabase/admin';
import type { Actor } from '@/types/contracts';
import { mapAccountingError } from '@/services/accounting/db-errors';
import { ruleInput } from './inputs';
import type { BankRule } from './matching-rules';

const COLUMNS = 'id, name, bank_account_id, contains_text, direction, account_id, memo, status';

interface Row {
  id: string;
  name: string;
  bank_account_id: string | null;
  contains_text: string;
  direction: string;
  account_id: string;
  memo: string;
  status: string;
}

const view = (r: Row): BankRule => ({
  id: r.id,
  name: r.name,
  bankAccountId: r.bank_account_id,
  containsText: r.contains_text,
  direction: r.direction === 'in' ? 'in' : r.direction === 'out' ? 'out' : 'any',
  accountId: r.account_id,
  memo: r.memo,
  status: r.status === 'inactive' ? 'inactive' : 'active',
});

export async function listRules(companyId: string): Promise<BankRule[]> {
  const { data, error } = await getAdminSupabase()
    .from('bank_rules')
    .select(COLUMNS)
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .order('created_at', { ascending: true })
    .limit(200);
  if (error) throw new InternalError(error);
  return ((data ?? []) as unknown as Row[]).map(view);
}

export async function createRule(actor: Actor, input: unknown): Promise<BankRule> {
  const companyId = actor.companyId;
  if (!companyId) throw new ValidationError('A company is needed.');
  const parsed = ruleInput.safeParse(input);
  if (!parsed.success)
    throw new ValidationError(parsed.error.issues[0]?.message ?? 'The rule is not valid.');
  const d = parsed.data;
  const acc = await getAdminSupabase()
    .from('accounts')
    .select('id, status, allow_posting')
    .eq('company_id', companyId)
    .eq('id', d.accountId)
    .is('deleted_at', null)
    .maybeSingle();
  if (acc.error) throw new InternalError(acc.error);
  if (!acc.data || acc.data.status !== 'active' || !acc.data.allow_posting)
    throw new ValidationError('Choose an active account that accepts postings.');
  const { data, error } = await getAdminSupabase()
    .from('bank_rules')
    .insert({
      company_id: companyId,
      name: d.name,
      bank_account_id: d.bankAccountId,
      contains_text: d.containsText,
      direction: d.direction,
      account_id: d.accountId,
      memo: d.memo,
      created_by: actor.userId,
    })
    .select(COLUMNS)
    .single();
  if (error) mapAccountingError(error);
  const created = view(data as unknown as Row);
  await getService('audit').record({
    action: 'bank.rule_created',
    resourceType: 'bank_rule',
    resourceId: created.id,
    companyId,
    metadata: { name: d.name },
  });
  return created;
}

export async function setRuleStatus(
  actor: Actor,
  id: string,
  status: 'active' | 'inactive',
): Promise<BankRule> {
  const companyId = actor.companyId;
  if (!companyId) throw new ValidationError('A company is needed.');
  const { data, error } = await getAdminSupabase()
    .from('bank_rules')
    .update({ status })
    .eq('company_id', companyId)
    .eq('id', id)
    .is('deleted_at', null)
    .select(COLUMNS);
  if (error) mapAccountingError(error);
  const row = (data ?? [])[0] as unknown as Row | undefined;
  if (!row) throw new NotFoundError();
  await getService('audit').record({
    action: 'bank.rule_changed',
    resourceType: 'bank_rule',
    resourceId: id,
    companyId,
    metadata: { status },
  });
  return view(row);
}

export async function removeRule(actor: Actor, id: string): Promise<void> {
  const companyId = actor.companyId;
  if (!companyId) throw new ValidationError('A company is needed.');
  const { data, error } = await getAdminSupabase()
    .from('bank_rules')
    .update({ deleted_at: new Date().toISOString() })
    .eq('company_id', companyId)
    .eq('id', id)
    .is('deleted_at', null)
    .select('id');
  if (error) mapAccountingError(error);
  if (!data || data.length === 0) throw new NotFoundError();
  await getService('audit').record({
    action: 'bank.rule_removed',
    resourceType: 'bank_rule',
    resourceId: id,
    companyId,
    metadata: {},
  });
}
