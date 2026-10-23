// path: services/reconciliation/matching.ts
// Matching bank lines to journal lines of the bank's ledger account. A bank line is matched when its matches add up to its
// amount (the database checks the journal line is posted, on the right account, once, with the same amount). A line that has
// no entry in the books can be booked to an account (bank fees, interest) which makes the entry and matches it.
import 'server-only';
import { getService } from '@/lib/container';
import { ConflictError, InternalError, NotFoundError, ValidationError } from '@/lib/errors';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { Money } from '@/lib/utils/currency';
import type { Actor } from '@/types/contracts';
import { getAccount } from '@/services/accounting/accounts';
import { mapAccountingError } from '@/services/accounting/db-errors';
import { postSystemEntry } from '@/services/accounting/journals';
import { getBankAccount, type BankAccountView } from './bank-accounts';
import { categorizeInput, confirmInput } from './inputs';
import {
  autoPairs,
  categorizeLines,
  suggest,
  type BankLine,
  type BookLine,
  type Suggestion,
} from './matching-rules';

export interface BankTxnView {
  id: string;
  bankAccountId: string;
  date: string;
  description: string;
  reference: string;
  amount: string;
  status: 'unmatched' | 'matched' | 'ignored';
  reconciliationId: string | null;
  note: string;
}

const COLUMNS =
  'id, bank_account_id, txn_date, description, reference, amount, status, reconciliation_id, note';

interface Row {
  id: string;
  bank_account_id: string;
  txn_date: string;
  description: string;
  reference: string;
  amount: string | number;
  status: string;
  reconciliation_id: string | null;
  note: string;
}

export const txnView = (r: Row): BankTxnView => ({
  id: r.id,
  bankAccountId: r.bank_account_id,
  date: String(r.txn_date),
  description: r.description,
  reference: r.reference,
  amount: Money.parseRounded(String(r.amount)).toDbString(),
  status: r.status === 'matched' ? 'matched' : r.status === 'ignored' ? 'ignored' : 'unmatched',
  reconciliationId: r.reconciliation_id,
  note: r.note,
});

export async function getTxn(companyId: string, id: string): Promise<BankTxnView> {
  const { data, error } = await getAdminSupabase()
    .from('bank_transactions')
    .select(COLUMNS)
    .eq('company_id', companyId)
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw new InternalError(error);
  if (!data) throw new NotFoundError();
  return txnView(data as unknown as Row);
}

const asBank = (t: BankTxnView): BankLine => ({
  id: t.id,
  date: t.date,
  amount: t.amount,
  description: t.description,
  reference: t.reference,
});

/** Posted journal lines of the ledger account that no bank line has matched, newest first. */
export async function unmatchedBookLines(
  companyId: string,
  account: BankAccountView,
  to?: string,
): Promise<BookLine[]> {
  const admin = getAdminSupabase();
  const [matched, lines] = await Promise.all([
    admin
      .from('bank_matches')
      .select('journal_line_id, bank_transactions!inner(bank_account_id)')
      .eq('company_id', companyId)
      .eq('bank_transactions.bank_account_id', account.id)
      .is('deleted_at', null)
      .limit(20_000),
    (() => {
      let q = admin
        .from('journal_lines')
        .select(
          'id, debit, credit, description, journal_entries!inner(id, entry_number, entry_date, memo, status)',
        )
        .eq('company_id', companyId)
        .eq('account_id', account.ledgerAccountId)
        .is('deleted_at', null)
        .eq('journal_entries.status', 'posted')
        .limit(5000);
      if (account.openingDate) q = q.gte('journal_entries.entry_date', account.openingDate);
      if (to) q = q.lte('journal_entries.entry_date', to);
      return q;
    })(),
  ]);
  if (matched.error) throw new InternalError(matched.error);
  if (lines.error) throw new InternalError(lines.error);
  const used = new Set((matched.data ?? []).map((m) => String(m.journal_line_id)));
  const out: BookLine[] = [];
  for (const raw of (lines.data ?? []) as unknown as {
    id: string;
    debit: string | number;
    credit: string | number;
    description: string | null;
    journal_entries:
      | { id: string; entry_number: string | null; entry_date: string; memo: string }
      | { id: string; entry_number: string | null; entry_date: string; memo: string }[];
  }[]) {
    if (used.has(String(raw.id))) continue;
    const e = Array.isArray(raw.journal_entries) ? raw.journal_entries[0] : raw.journal_entries;
    if (!e) continue;
    out.push({
      lineId: String(raw.id),
      entryId: e.id,
      entryNumber: e.entry_number ?? '',
      date: String(e.entry_date),
      amount: Money.parseRounded(String(raw.debit)).sub(String(raw.credit)).toDbString(),
      memo: e.memo,
      description: raw.description ?? '',
    });
  }
  return out.sort((a, b) => b.date.localeCompare(a.date));
}

export interface TxnWithSuggestions {
  txn: BankTxnView;
  suggestions: Suggestion[];
}

export async function suggestionsFor(
  companyId: string,
  txnId: string,
): Promise<TxnWithSuggestions> {
  const txn = await getTxn(companyId, txnId);
  const account = await getBankAccount(companyId, txn.bankAccountId);
  return { txn, suggestions: suggest(asBank(txn), await unmatchedBookLines(companyId, account)) };
}

/** The unmatched queue of an account with the best suggestion for each line. */
export async function unmatchedQueue(
  companyId: string,
  bankAccountId: string,
  limit = 100,
): Promise<TxnWithSuggestions[]> {
  const account = await getBankAccount(companyId, bankAccountId);
  const { data, error } = await getAdminSupabase()
    .from('bank_transactions')
    .select(COLUMNS)
    .eq('company_id', companyId)
    .eq('bank_account_id', bankAccountId)
    .eq('status', 'unmatched')
    .is('reconciliation_id', null)
    .is('deleted_at', null)
    .order('txn_date', { ascending: true })
    .limit(Math.min(Math.max(limit, 1), 500));
  if (error) throw new InternalError(error);
  const book = await unmatchedBookLines(companyId, account);
  return ((data ?? []) as unknown as Row[])
    .map(txnView)
    .map((txn) => ({ txn, suggestions: suggest(asBank(txn), book, 3) }));
}

async function refresh(txnId: string): Promise<string> {
  const { data, error } = await getAdminSupabase().rpc('kd_bank_refresh_status', { p_txn: txnId });
  if (error) mapAccountingError(error);
  return String(data);
}

async function audit(
  companyId: string,
  action: string,
  id: string,
  metadata: Record<string, unknown>,
): Promise<void> {
  await getService('audit').record({
    action,
    resourceType: 'bank_transaction',
    resourceId: id,
    companyId,
    metadata,
  });
}

async function insertMatches(
  companyId: string,
  txn: BankTxnView,
  lines: readonly { id: string; amount: string }[],
  method: 'auto' | 'manual' | 'rule' | 'adjustment',
  by: string | null,
): Promise<void> {
  const rows = lines.map((l) => ({
    company_id: companyId,
    bank_transaction_id: txn.id,
    journal_line_id: l.id,
    amount: l.amount,
    method,
    matched_by: by,
  }));
  const { error } = await getAdminSupabase().from('bank_matches').insert(rows);
  if (error) {
    if (error.code === '23505')
      throw new ConflictError('One of the journal lines is already matched to another bank line.');
    mapAccountingError(error);
  }
  await refresh(txn.id);
}

/** Matches a bank line to one or more journal lines whose amounts add up to the bank amount. */
export async function confirmMatch(
  actor: Actor,
  txnId: string,
  input: unknown,
  method: 'manual' | 'auto' = 'manual',
): Promise<BankTxnView> {
  const companyId = actor.companyId;
  if (!companyId) throw new ValidationError('A company is needed.');
  const parsed = confirmInput.safeParse(input);
  if (!parsed.success)
    throw new ValidationError(parsed.error.issues[0]?.message ?? 'Choose the journal lines.');
  const txn = await getTxn(companyId, txnId);
  if (txn.reconciliationId) throw new ConflictError('This bank line is already reconciled.');
  if (txn.status !== 'unmatched')
    throw new ConflictError('This bank line is already matched or ignored.');
  const { data, error } = await getAdminSupabase()
    .from('journal_lines')
    .select('id, debit, credit')
    .eq('company_id', companyId)
    .in('id', parsed.data.lineIds)
    .is('deleted_at', null);
  if (error) throw new InternalError(error);
  const lines = (data ?? []).map((l) => ({
    id: String(l.id),
    amount: Money.parseRounded(String(l.debit)).sub(String(l.credit)).toDbString(),
  }));
  if (lines.length !== new Set(parsed.data.lineIds).size) throw new NotFoundError();
  const sum = Money.sum(lines.map((l) => Money.parse(l.amount)));
  if (!sum.eq(txn.amount))
    throw new ValidationError(
      `The journal lines add up to ${sum.toDbString()} but the bank line is ${txn.amount}.`,
    );
  await insertMatches(companyId, txn, lines, method, actor.userId);
  await audit(companyId, 'bank.matched', txnId, { lines: lines.length, method });
  return getTxn(companyId, txnId);
}

export async function unmatch(actor: Actor, txnId: string): Promise<BankTxnView> {
  const companyId = actor.companyId;
  if (!companyId) throw new ValidationError('A company is needed.');
  const txn = await getTxn(companyId, txnId);
  if (txn.reconciliationId) throw new ConflictError('This bank line is already reconciled.');
  const { error } = await getAdminSupabase()
    .from('bank_matches')
    .update({ deleted_at: new Date().toISOString() })
    .eq('company_id', companyId)
    .eq('bank_transaction_id', txnId)
    .is('deleted_at', null);
  if (error) mapAccountingError(error);
  await refresh(txnId);
  await audit(companyId, 'bank.unmatched', txnId, {});
  return getTxn(companyId, txnId);
}

/** A line that is not part of the books (a duplicate, a transfer booked elsewhere) is ignored; it can be restored. */
export async function setIgnored(
  actor: Actor,
  txnId: string,
  ignored: boolean,
): Promise<BankTxnView> {
  const companyId = actor.companyId;
  if (!companyId) throw new ValidationError('A company is needed.');
  const txn = await getTxn(companyId, txnId);
  if (txn.reconciliationId) throw new ConflictError('This bank line is already reconciled.');
  if (ignored && txn.status !== 'unmatched')
    throw new ConflictError('Only an unmatched bank line can be ignored.');
  if (!ignored && txn.status !== 'ignored') return txn;
  const { error } = await getAdminSupabase()
    .from('bank_transactions')
    .update({ status: ignored ? 'ignored' : 'unmatched' })
    .eq('company_id', companyId)
    .eq('id', txnId);
  if (error) mapAccountingError(error);
  await audit(companyId, ignored ? 'bank.ignored' : 'bank.restored', txnId, {});
  return getTxn(companyId, txnId);
}

/** Books an unmatched bank line to an account (fee, interest, owner draw): the entry is made, posted and matched. */
export async function categorize(
  actor: Actor | null,
  companyId: string,
  txnId: string,
  input: unknown,
  method: 'rule' | 'adjustment' = 'adjustment',
): Promise<BankTxnView> {
  const parsed = categorizeInput.safeParse(input);
  if (!parsed.success)
    throw new ValidationError(parsed.error.issues[0]?.message ?? 'Choose an account.');
  const txn = await getTxn(companyId, txnId);
  if (txn.reconciliationId) throw new ConflictError('This bank line is already reconciled.');
  if (txn.status !== 'unmatched')
    throw new ConflictError('Only an unmatched bank line can be booked.');
  const account = await getBankAccount(companyId, txn.bankAccountId);
  const counter = await getAccount(companyId, parsed.data.accountId);
  if (counter.status !== 'active' || !counter.allowPosting)
    throw new ValidationError('Choose an active account that accepts postings.');
  if (counter.id === account.ledgerAccountId)
    throw new ValidationError('Choose an account other than the bank account.');
  const posted = await postSystemEntry({
    companyId,
    date: txn.date,
    memo: (parsed.data.memo || txn.description || 'Bank line').slice(0, 500),
    sourceType: 'bank_txn',
    sourceId: txnId,
    sourceKey: `bank:${txnId}:booked`,
    lines: categorizeLines(txn, account.ledgerAccountId, counter.id, parsed.data.memo),
  });
  const { data, error } = await getAdminSupabase()
    .from('journal_lines')
    .select('id, debit, credit')
    .eq('entry_id', posted.entryId)
    .eq('account_id', account.ledgerAccountId)
    .is('deleted_at', null);
  if (error) throw new InternalError(error);
  const line = (data ?? [])[0];
  if (!line) throw new InternalError(new Error('The entry has no line on the bank account.'));
  const existing = await getAdminSupabase()
    .from('bank_matches')
    .select('id')
    .eq('journal_line_id', String(line.id))
    .is('deleted_at', null)
    .limit(1);
  if (existing.error) throw new InternalError(existing.error);
  if ((existing.data ?? []).length === 0)
    await insertMatches(
      companyId,
      txn,
      [
        {
          id: String(line.id),
          amount: Money.parseRounded(String(line.debit)).sub(String(line.credit)).toDbString(),
        },
      ],
      method,
      actor?.userId ?? null,
    );
  await audit(companyId, 'bank.booked', txnId, { account: counter.code, entryId: posted.entryId });
  return getTxn(companyId, txnId);
}

export interface AutoMatchResult {
  matched: number;
  left: number;
}

/** Bulk reconcile: matches every bank line that has one clear candidate. */
export async function autoMatchAll(actor: Actor, bankAccountId: string): Promise<AutoMatchResult> {
  const companyId = actor.companyId;
  if (!companyId) throw new ValidationError('A company is needed.');
  const account = await getBankAccount(companyId, bankAccountId);
  const { data, error } = await getAdminSupabase()
    .from('bank_transactions')
    .select(COLUMNS)
    .eq('company_id', companyId)
    .eq('bank_account_id', bankAccountId)
    .eq('status', 'unmatched')
    .is('reconciliation_id', null)
    .is('deleted_at', null)
    .limit(2000);
  if (error) throw new InternalError(error);
  const txns = ((data ?? []) as unknown as Row[]).map(txnView);
  const pairs = autoPairs(txns.map(asBank), await unmatchedBookLines(companyId, account));
  let matched = 0;
  for (const p of pairs) {
    try {
      await confirmMatch(actor, p.bankTransactionId, { lineIds: [p.lineId] }, 'auto');
      matched += 1;
    } catch {
      // A pair that cannot be made (changed since it was suggested) is left in the queue.
    }
  }
  await audit(companyId, 'bank.auto_matched', bankAccountId, { matched });
  return { matched, left: txns.length - matched };
}
