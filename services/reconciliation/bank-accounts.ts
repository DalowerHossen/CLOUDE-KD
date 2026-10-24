// path: services/reconciliation/bank-accounts.ts
// Bank accounts of a company: a name, the bank, the last 4 digits (never the full number), the cash account of the chart they
// post to, and the balance the statements start from.
import 'server-only';
import { getService } from '@/lib/container';
import { ConflictError, InternalError, NotFoundError, ValidationError } from '@/lib/errors';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { Money } from '@/lib/utils/currency';
import type { Actor } from '@/types/contracts';
import { mapAccountingError } from '@/services/accounting/db-errors';
import { bankAccountInput, bankAccountUpdate } from './inputs';

export interface BankAccountView {
  id: string;
  name: string;
  bankName: string;
  last4: string | null;
  ledgerAccountId: string;
  openingBalance: string;
  openingDate: string | null;
  status: 'active' | 'closed';
  version: number;
}

const COLUMNS =
  'id, name, bank_name, last4, ledger_account_id, opening_balance, opening_date, status, version';

interface Row {
  id: string;
  name: string;
  bank_name: string;
  last4: string | null;
  ledger_account_id: string;
  opening_balance: string | number;
  opening_date: string | null;
  status: string;
  version: number;
}

const view = (r: Row): BankAccountView => ({
  id: r.id,
  name: r.name,
  bankName: r.bank_name,
  last4: r.last4,
  ledgerAccountId: r.ledger_account_id,
  openingBalance: Money.parseRounded(String(r.opening_balance)).toDbString(),
  openingDate: r.opening_date ? String(r.opening_date) : null,
  status: r.status === 'closed' ? 'closed' : 'active',
  version: r.version,
});

export async function listBankAccounts(companyId: string): Promise<BankAccountView[]> {
  const { data, error } = await getAdminSupabase()
    .from('bank_accounts')
    .select(COLUMNS)
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .order('name', { ascending: true })
    .limit(100);
  if (error) throw new InternalError(error);
  return ((data ?? []) as unknown as Row[]).map(view);
}

export async function getBankAccount(companyId: string, id: string): Promise<BankAccountView> {
  const { data, error } = await getAdminSupabase()
    .from('bank_accounts')
    .select(COLUMNS)
    .eq('company_id', companyId)
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw new InternalError(error);
  if (!data) throw new NotFoundError();
  return view(data as unknown as Row);
}

export async function createBankAccount(actor: Actor, input: unknown): Promise<BankAccountView> {
  const companyId = actor.companyId;
  if (!companyId) throw new ValidationError('A company is needed.');
  const parsed = bankAccountInput.safeParse(input);
  if (!parsed.success)
    throw new ValidationError(parsed.error.issues[0]?.message ?? 'The bank account is not valid.');
  const d = parsed.data;
  const { data, error } = await getAdminSupabase()
    .from('bank_accounts')
    .insert({
      company_id: companyId,
      name: d.name,
      bank_name: d.bankName,
      last4: d.last4,
      ledger_account_id: d.ledgerAccountId,
      opening_balance: d.openingBalance,
      opening_date: d.openingDate,
      created_by: actor.userId,
    })
    .select(COLUMNS)
    .single();
  if (error) mapAccountingError(error);
  const created = view(data as unknown as Row);
  await getService('audit').record({
    action: 'bank.account_created',
    resourceType: 'bank_account',
    resourceId: created.id,
    companyId,
    metadata: { name: d.name },
  });
  return created;
}

export async function updateBankAccount(
  actor: Actor,
  id: string,
  input: unknown,
): Promise<BankAccountView> {
  const companyId = actor.companyId;
  if (!companyId) throw new ValidationError('A company is needed.');
  const parsed = bankAccountUpdate.safeParse(input);
  if (!parsed.success)
    throw new ValidationError(parsed.error.issues[0]?.message ?? 'The change is not valid.');
  const d = parsed.data;
  const patch: Record<string, unknown> = {};
  if (d.name !== undefined) patch.name = d.name;
  if (d.bankName !== undefined) patch.bank_name = d.bankName;
  if (d.status !== undefined) patch.status = d.status;
  const { data, error } = await getAdminSupabase()
    .from('bank_accounts')
    .update(patch)
    .eq('company_id', companyId)
    .eq('id', id)
    .eq('version', d.version)
    .is('deleted_at', null)
    .select(COLUMNS);
  if (error) mapAccountingError(error);
  const row = (data ?? [])[0] as unknown as Row | undefined;
  if (!row)
    throw new ConflictError('Someone else changed this bank account. Reload and try again.');
  await getService('audit').record({
    action: 'bank.account_changed',
    resourceType: 'bank_account',
    resourceId: id,
    companyId,
    metadata: { fields: Object.keys(patch) },
  });
  return view(row);
}
