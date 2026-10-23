// path: services/reconciliation/reconcile.ts
// The reconciliation of a bank account up to a statement date. The person enters the statement date and the ending balance; the
// lines up to that date must all be matched (or ignored) and add up to the change since the last statement. Completing it
// ties the lines to the reconciliation and locks them. The books are also compared with the statement: the ledger balance less
// the entries the bank has not shown yet should equal the statement balance.
import 'server-only';
import { getService } from '@/lib/container';
import { ConflictError, InternalError, NotFoundError, ValidationError } from '@/lib/errors';
import type { ReportColumn, ReportResult } from '@/lib/reports/types';
import { toInt } from '@/lib/reports/numbers';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { Money } from '@/lib/utils/currency';
import type { Actor } from '@/types/contracts';
import { mapAccountingError } from '@/services/accounting/db-errors';
import { getBankAccount } from './bank-accounts';
import { completeInput, startInput } from './inputs';
import { unmatchedBookLines } from './matching';
import type { BookLine } from './matching-rules';

export interface ReconciliationView {
  id: string;
  bankAccountId: string;
  statementDate: string;
  statementBalance: string;
  openingBalance: string;
  clearedTotal: string;
  difference: string;
  status: 'in_progress' | 'completed';
  note: string;
  completedAt: string | null;
}

const COLUMNS =
  'id, bank_account_id, statement_date, statement_balance, opening_balance, cleared_total, difference, status, note, completed_at';

interface Row {
  id: string;
  bank_account_id: string;
  statement_date: string;
  statement_balance: string | number;
  opening_balance: string | number;
  cleared_total: string | number;
  difference: string | number;
  status: string;
  note: string;
  completed_at: string | null;
}

const m = (v: string | number): string => Money.parseRounded(String(v)).toDbString();

const view = (r: Row): ReconciliationView => ({
  id: r.id,
  bankAccountId: r.bank_account_id,
  statementDate: String(r.statement_date),
  statementBalance: m(r.statement_balance),
  openingBalance: m(r.opening_balance),
  clearedTotal: m(r.cleared_total),
  difference: m(r.difference),
  status: r.status === 'completed' ? 'completed' : 'in_progress',
  note: r.note,
  completedAt: r.completed_at,
});

export async function getReconciliation(
  companyId: string,
  id: string,
): Promise<ReconciliationView> {
  const { data, error } = await getAdminSupabase()
    .from('reconciliations')
    .select(COLUMNS)
    .eq('company_id', companyId)
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw new InternalError(error);
  if (!data) throw new NotFoundError();
  return view(data as unknown as Row);
}

export async function openReconciliation(
  companyId: string,
  bankAccountId: string,
): Promise<ReconciliationView | null> {
  const { data, error } = await getAdminSupabase()
    .from('reconciliations')
    .select(COLUMNS)
    .eq('company_id', companyId)
    .eq('bank_account_id', bankAccountId)
    .eq('status', 'in_progress')
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw new InternalError(error);
  return data ? view(data as unknown as Row) : null;
}

/** All reconciliations of an account, newest first (the history). */
export async function reconciliationHistory(
  companyId: string,
  bankAccountId: string,
): Promise<ReconciliationView[]> {
  const { data, error } = await getAdminSupabase()
    .from('reconciliations')
    .select(COLUMNS)
    .eq('company_id', companyId)
    .eq('bank_account_id', bankAccountId)
    .is('deleted_at', null)
    .order('statement_date', { ascending: false })
    .limit(200);
  if (error) throw new InternalError(error);
  return ((data ?? []) as unknown as Row[]).map(view);
}

export async function startReconciliation(
  actor: Actor,
  input: unknown,
): Promise<ReconciliationView> {
  const companyId = actor.companyId;
  if (!companyId) throw new ValidationError('A company is needed.');
  const parsed = startInput.safeParse(input);
  if (!parsed.success)
    throw new ValidationError(parsed.error.issues[0]?.message ?? 'The statement is not valid.');
  const d = parsed.data;
  await getBankAccount(companyId, d.bankAccountId);
  const { data, error } = await getAdminSupabase().rpc('kd_reconciliation_start', {
    p_company: companyId,
    p_account: d.bankAccountId,
    p_date: d.statementDate,
    p_balance: d.statementBalance,
    p_actor: actor.userId,
  });
  if (error) {
    if (error.code === '23505')
      throw new ConflictError(
        'A reconciliation of this account is already in progress. Finish it first.',
      );
    mapAccountingError(error);
  }
  await getService('audit').record({
    action: 'bank.reconciliation_started',
    resourceType: 'reconciliation',
    resourceId: String(data),
    companyId,
    metadata: { date: d.statementDate },
  });
  return getReconciliation(companyId, String(data));
}

export interface ReconciliationState {
  reconciliation: ReconciliationView;
  lines: number;
  unmatched: number;
  clearedTotal: string;
  expected: string;
  /** Statement change less the lines: zero when the lines explain the statement. */
  difference: string;
  book: {
    ledgerBalance: string;
    notShownByBank: string;
    clearedBook: string;
    /** Statement balance less the cleared book balance: zero when books and bank agree. */
    discrepancy: string;
  };
  notShownByBank: BookLine[];
}

/** The books side: ledger balance at the statement date and the entries the bank has not shown yet. */
async function bookSide(
  companyId: string,
  bankAccountId: string,
  statementDate: string,
  statementBalance: string,
): Promise<{ side: ReconciliationState['book']; items: BookLine[] }> {
  const account = await getBankAccount(companyId, bankAccountId);
  const { data, error } = await getAdminSupabase().rpc('kd_ledger_balances', {
    p_company: companyId,
    p_from: account.openingDate,
    p_to: statementDate,
    p_closing: true,
  });
  if (error) throw new InternalError(error);
  const row = (
    (data ?? []) as { account_id: string; debit: string | number; credit: string | number }[]
  ).find((r) => String(r.account_id) === account.ledgerAccountId);
  const net = row ? Money.parseRounded(String(row.debit)).sub(String(row.credit)) : Money.zero();
  const ledger = Money.parse(account.openingBalance).add(net);
  const items = await unmatchedBookLines(companyId, account, statementDate);
  const pending = Money.sum(items.map((i) => Money.parse(i.amount)));
  const cleared = ledger.sub(pending);
  return {
    side: {
      ledgerBalance: ledger.toDbString(),
      notShownByBank: pending.toDbString(),
      clearedBook: cleared.toDbString(),
      discrepancy: Money.parse(statementBalance).sub(cleared).toDbString(),
    },
    items,
  };
}

export async function reconciliationState(
  companyId: string,
  id: string,
): Promise<ReconciliationState> {
  const rec = await getReconciliation(companyId, id);
  const { data, error } = await getAdminSupabase().rpc('kd_reconciliation_state', {
    p_company: companyId,
    p_rec: id,
  });
  if (error) mapAccountingError(error);
  const s = data as {
    lines: number;
    unmatched: number;
    cleared_total: string | number;
    expected: string | number;
    difference: string | number;
  };
  const { side, items } = await bookSide(
    companyId,
    rec.bankAccountId,
    rec.statementDate,
    rec.statementBalance,
  );
  return {
    reconciliation: rec,
    lines: toInt(s.lines),
    unmatched: toInt(s.unmatched),
    clearedTotal: m(s.cleared_total),
    expected: m(s.expected),
    difference: m(s.difference),
    book: side,
    notShownByBank: items,
  };
}

export async function completeReconciliation(
  actor: Actor,
  id: string,
  input: unknown,
): Promise<ReconciliationView> {
  const companyId = actor.companyId;
  if (!companyId) throw new ValidationError('A company is needed.');
  const parsed = completeInput.safeParse(input);
  if (!parsed.success)
    throw new ValidationError(parsed.error.issues[0]?.message ?? 'The note is not valid.');
  const { error } = await getAdminSupabase().rpc('kd_reconciliation_complete', {
    p_company: companyId,
    p_rec: id,
    p_actor: actor.userId,
    p_note: parsed.data.note,
  });
  if (error) mapAccountingError(error);
  await getService('audit').record({
    action: 'bank.reconciliation_completed',
    resourceType: 'reconciliation',
    resourceId: id,
    companyId,
    metadata: {},
  });
  return getReconciliation(companyId, id);
}

const col = (key: string, label: string, type: ReportColumn['type'] = 'text'): ReportColumn => ({
  key,
  label,
  type,
});

/** The reconciliation report: the summary, the bank lines it cleared and the entries the bank had not shown yet. */
export async function reconciliationReport(companyId: string, id: string): Promise<ReportResult> {
  const st = await reconciliationState(companyId, id);
  const rec = st.reconciliation;
  const account = await getBankAccount(companyId, rec.bankAccountId);
  const { data, error } = await getAdminSupabase()
    .from('bank_transactions')
    .select('txn_date, description, reference, amount, status')
    .eq('company_id', companyId)
    .eq('bank_account_id', rec.bankAccountId)
    .is('deleted_at', null)
    .or(
      `reconciliation_id.eq.${id},and(reconciliation_id.is.null,txn_date.lte.${rec.statementDate})`,
    )
    .neq('status', 'ignored')
    .order('txn_date', { ascending: true })
    .limit(5000);
  if (error) throw new InternalError(error);
  const rows: Record<string, string>[] = [
    {
      kind: 'Summary',
      date: rec.statementDate,
      text: 'Statement balance',
      amount: rec.statementBalance,
    },
    { kind: 'Summary', date: '', text: 'Opening balance', amount: rec.openingBalance },
    {
      kind: 'Summary',
      date: '',
      text: 'Bank lines in this reconciliation',
      amount: st.clearedTotal,
    },
    { kind: 'Summary', date: '', text: 'Difference (must be zero)', amount: st.difference },
    {
      kind: 'Summary',
      date: '',
      text: 'Ledger balance at the statement date',
      amount: st.book.ledgerBalance,
    },
    {
      kind: 'Summary',
      date: '',
      text: 'Entries the bank has not shown',
      amount: st.book.notShownByBank,
    },
    {
      kind: 'Summary',
      date: '',
      text: 'Books against statement (must be zero)',
      amount: st.book.discrepancy,
    },
    ...(data ?? []).map((t) => ({
      kind: 'Bank line',
      date: String(t.txn_date),
      text: [t.description, t.reference].filter(Boolean).join(' '),
      amount: Money.parseRounded(String(t.amount)).toDbString(),
    })),
    ...st.notShownByBank.map((b) => ({
      kind: 'Not shown by the bank',
      date: b.date,
      text: `${b.entryNumber} ${b.memo}`.trim(),
      amount: b.amount,
    })),
  ];
  return {
    key: 'bank_reconciliation',
    title: `Bank reconciliation - ${account.name}`,
    period: null,
    columns: [
      col('kind', 'Kind'),
      col('date', 'Date', 'date'),
      col('text', 'Description'),
      col('amount', 'Amount', 'money'),
    ],
    rows,
    totals: null,
    notes: [
      rec.status === 'completed'
        ? `Completed ${rec.completedAt?.slice(0, 10) ?? ''}`
        : 'In progress',
    ],
  };
}
