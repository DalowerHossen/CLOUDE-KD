// path: services/accounting/reports.ts
// The financial reports of a company. Each report reads the posted ledger (SQL sums per account) and the account list, then
// hands them to the pure rules of `report-rules.ts`. Only posted entries count; the year-end closing entries are counted in
// balances (so equity is right) and left out of the profit and loss of a period.
import 'server-only';
import { InternalError, ValidationError } from '@/lib/errors';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { Money } from '@/lib/utils/currency';
import { listAccounts } from './accounts';
import {
  aging,
  balanceSheet,
  cashBalances,
  cashFlowIndirect,
  expenseSummary,
  expenseTrend,
  ledgerAccount,
  natural,
  monthlyTrend,
  monthsBetween,
  profitAndLoss,
  ratios,
  taxSummary,
  trialBalance,
  withComparison,
  type AccountMeta,
  type AccountType,
  type Aging,
  type AgingItem,
  type Balance,
  type BalanceSheet,
  type CashFlow,
  type ExpenseSummary,
  type ExpenseTrendRow,
  type MonthColumn,
  type ProfitLoss,
  type Ratios,
  type TaxSummary,
  type LedgerAccount,
  type LedgerLine,
} from './report-rules';

async function metas(companyId: string): Promise<AccountMeta[]> {
  return (await listAccounts(companyId)).map((a) => ({
    id: a.id,
    code: a.code,
    name: a.name,
    type: a.type as AccountType,
    subtype: a.subtype,
    isContra: a.isContra,
    isCash: a.isCash,
    systemKey: a.systemKey,
  }));
}

async function balances(
  companyId: string,
  from: string | null,
  to: string | null,
  closing: boolean,
): Promise<Balance[]> {
  const { data, error } = await getAdminSupabase().rpc('kd_ledger_balances', {
    p_company: companyId,
    p_from: from,
    p_to: to,
    p_closing: closing,
  });
  if (error) throw new InternalError(error);
  return (
    (data ?? []) as { account_id: string; debit: string | number; credit: string | number }[]
  ).map((r) => ({
    accountId: String(r.account_id),
    debit: Money.parseRounded(String(r.debit)).toDbString(),
    credit: Money.parseRounded(String(r.credit)).toDbString(),
  }));
}

async function monthly(
  companyId: string,
  from: string,
  to: string,
): Promise<Map<string, Balance[]>> {
  const { data, error } = await getAdminSupabase().rpc('kd_ledger_monthly', {
    p_company: companyId,
    p_from: from,
    p_to: to,
  });
  if (error) throw new InternalError(error);
  const out = new Map<string, Balance[]>();
  for (const r of (data ?? []) as {
    month: string;
    account_id: string;
    debit: string | number;
    credit: string | number;
  }[]) {
    out.set(r.month, [
      ...(out.get(r.month) ?? []),
      {
        accountId: String(r.account_id),
        debit: Money.parseRounded(String(r.debit)).toDbString(),
        credit: Money.parseRounded(String(r.credit)).toDbString(),
      },
    ]);
  }
  return out;
}

export function dayBefore(day: string): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
}

function checkPeriod(from: string, to: string): void {
  if (from > to) throw new ValidationError('The start date must not be after the end date.');
  if (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`) > 800 * 86_400_000)
    throw new ValidationError('A report covers at most about two years.');
}

type PlReport = ProfitLoss & {
  from: string;
  to: string;
  compare: { from: string; to: string; netIncome: string; revenue: string } | null;
};
type BsReport = BalanceSheet & {
  asOf: string;
  compare: {
    asOf: string;
    totalAssets: string;
    totalLiabilities: string;
    totalEquity: string;
  } | null;
};

export async function trialBalanceReport(
  companyId: string,
  asOf: string,
): Promise<ReturnType<typeof trialBalance> & { asOf: string }> {
  const [accounts, bal] = await Promise.all([
    metas(companyId),
    balances(companyId, null, asOf, true),
  ]);
  return { asOf, ...trialBalance(accounts, bal) };
}

export interface LedgerRequest {
  from: string;
  to: string;
  accountId?: string;
}

/** General ledger (all accounts with activity) or the register of one account, with opening balance and running balance. */
export async function generalLedgerReport(
  companyId: string,
  req: LedgerRequest,
): Promise<{ from: string; to: string; accounts: LedgerAccount[]; truncated: boolean }> {
  checkPeriod(req.from, req.to);
  const accounts = await metas(companyId);
  const admin = getAdminSupabase();
  let q = admin
    .from('journal_lines')
    .select(
      'account_id, debit, credit, description, journal_entries!inner(id, entry_date, entry_number, memo, status, entry_kind)',
    )
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .eq('journal_entries.status', 'posted')
    .gte('journal_entries.entry_date', req.from)
    .lte('journal_entries.entry_date', req.to)
    .limit(5001);
  if (req.accountId) q = q.eq('account_id', req.accountId);
  const { data, error } = await q;
  if (error) throw new InternalError(error);
  const rows = (data ?? []) as unknown as {
    account_id: string;
    debit: string | number;
    credit: string | number;
    description: string | null;
    journal_entries:
      | {
          id: string;
          entry_date: string;
          entry_number: string | null;
          memo: string;
          entry_kind: string;
        }
      | {
          id: string;
          entry_date: string;
          entry_number: string | null;
          memo: string;
          entry_kind: string;
        }[];
  }[];
  const truncated = rows.length > 5000;
  const byAccount = new Map<string, LedgerLine[]>();
  for (const r of rows.slice(0, 5000)) {
    const e = Array.isArray(r.journal_entries) ? r.journal_entries[0] : r.journal_entries;
    if (!e) continue;
    const line: LedgerLine = {
      entryId: e.id,
      date: e.entry_date,
      number: e.entry_number ?? '',
      memo: e.memo,
      description: r.description ?? '',
      debit: Money.parseRounded(String(r.debit)).toDbString(),
      credit: Money.parseRounded(String(r.credit)).toDbString(),
    };
    byAccount.set(r.account_id, [...(byAccount.get(r.account_id) ?? []), line]);
  }
  const opening = await balances(companyId, null, dayBefore(req.from), true);
  const openBy = new Map(opening.map((b) => [b.accountId, b]));
  const out: LedgerAccount[] = [];
  for (const meta of accounts.sort((a, b) => a.code.localeCompare(b.code))) {
    if (req.accountId && meta.id !== req.accountId) continue;
    const lines = byAccount.get(meta.id) ?? [];
    const ob = openBy.get(meta.id);
    const openNatural = ob ? natural(meta, ob) : Money.zero();
    if (lines.length === 0 && (openNatural.isZero() || !req.accountId)) continue;
    out.push(ledgerAccount(meta, openNatural, lines));
  }
  return { from: req.from, to: req.to, accounts: out, truncated };
}

export async function profitLossReport(
  companyId: string,
  from: string,
  to: string,
  compare?: { from: string; to: string },
): Promise<PlReport> {
  checkPeriod(from, to);
  const accounts = await metas(companyId);
  const current = profitAndLoss(accounts, await balances(companyId, from, to, false));
  if (!compare) return { from, to, ...current, compare: null };
  checkPeriod(compare.from, compare.to);
  const previous = profitAndLoss(
    accounts,
    await balances(companyId, compare.from, compare.to, false),
  );
  return {
    from,
    to,
    ...current,
    sections: withComparison(current.sections, previous.sections),
    compare: {
      from: compare.from,
      to: compare.to,
      netIncome: previous.netIncome,
      revenue: previous.revenue,
    },
  };
}

export async function profitLossTrendReport(
  companyId: string,
  from: string,
  to: string,
): Promise<{ from: string; to: string; months: MonthColumn[] }> {
  checkPeriod(from, to);
  const [accounts, byMonth] = await Promise.all([metas(companyId), monthly(companyId, from, to)]);
  return {
    from,
    to,
    months: monthlyTrend(accounts, monthsBetween(from.slice(0, 7), to.slice(0, 7)), byMonth),
  };
}

export async function balanceSheetReport(
  companyId: string,
  asOf: string,
  compareAsOf?: string,
): Promise<BsReport> {
  const accounts = await metas(companyId);
  const current = balanceSheet(accounts, await balances(companyId, null, asOf, true));
  if (!compareAsOf) return { asOf, ...current, compare: null };
  const previous = balanceSheet(accounts, await balances(companyId, null, compareAsOf, true));
  return {
    asOf,
    ...current,
    compare: {
      asOf: compareAsOf,
      totalAssets: previous.totalAssets,
      totalLiabilities: previous.totalLiabilities,
      totalEquity: previous.totalEquity,
    },
  };
}

export async function cashFlowReport(
  companyId: string,
  from: string,
  to: string,
): Promise<CashFlow & { from: string; to: string }> {
  checkPeriod(from, to);
  const accounts = await metas(companyId);
  const [open, close, period] = await Promise.all([
    balances(companyId, null, dayBefore(from), true),
    balances(companyId, null, to, true),
    balances(companyId, from, to, false),
  ]);
  const net = Money.parse(profitAndLoss(accounts, period).netIncome);
  return { from, to, ...cashFlowIndirect(accounts, open, close, net) };
}

export async function cashBalanceReport(
  companyId: string,
  asOf: string,
): Promise<ReturnType<typeof cashBalances> & { asOf: string }> {
  const [accounts, bal] = await Promise.all([
    metas(companyId),
    balances(companyId, null, asOf, true),
  ]);
  return { asOf, ...cashBalances(accounts, bal) };
}

export async function taxSummaryReport(
  companyId: string,
  from: string,
  to: string,
): Promise<TaxSummary & { from: string; to: string }> {
  checkPeriod(from, to);
  const [accounts, bal] = await Promise.all([
    metas(companyId),
    balances(companyId, from, to, false),
  ]);
  return { from, to, ...taxSummary(accounts, bal) };
}

export async function ratiosReport(
  companyId: string,
  from: string,
  to: string,
): Promise<Ratios & { from: string; to: string }> {
  checkPeriod(from, to);
  const accounts = await metas(companyId);
  const [closing, period] = await Promise.all([
    balances(companyId, null, to, true),
    balances(companyId, from, to, false),
  ]);
  return {
    from,
    to,
    ...ratios(accounts, balanceSheet(accounts, closing), profitAndLoss(accounts, period), closing),
  };
}

export async function expenseSummaryReport(
  companyId: string,
  from: string,
  to: string,
): Promise<ExpenseSummary & { from: string; to: string }> {
  checkPeriod(from, to);
  const [accounts, bal] = await Promise.all([
    metas(companyId),
    balances(companyId, from, to, false),
  ]);
  return { from, to, ...expenseSummary(accounts, bal) };
}

export async function expenseTrendReport(
  companyId: string,
  from: string,
  to: string,
): Promise<{ from: string; to: string; months: string[]; rows: ExpenseTrendRow[] }> {
  checkPeriod(from, to);
  const [accounts, byMonth] = await Promise.all([metas(companyId), monthly(companyId, from, to)]);
  const months = monthsBetween(from.slice(0, 7), to.slice(0, 7));
  return { from, to, months, rows: expenseTrend(accounts, months, byMonth) };
}

const OPEN_INVOICE = ['sent', 'viewed', 'partially_paid', 'overdue'];

/** Unpaid invoices by days past due. The sub-ledger holds today's amounts, so a past date is a good estimate only. */
export async function arAgingReport(companyId: string, asOf: string): Promise<Aging> {
  const { data, error } = await getAdminSupabase()
    .from('invoices')
    .select('id, number, due_date, amount_due, bill_to')
    .eq('company_id', companyId)
    .eq('kind', 'invoice')
    .in('status', OPEN_INVOICE)
    .is('deleted_at', null)
    .gt('amount_due', 0)
    .limit(10_000);
  if (error) throw new InternalError(error);
  const items: AgingItem[] = (data ?? []).map((r) => ({
    id: String(r.id),
    party: String((r.bill_to as { name?: string } | null)?.name ?? ''),
    reference: String(r.number ?? ''),
    dueDate: String(r.due_date),
    amount: Money.parseRounded(String(r.amount_due)).toDbString(),
  }));
  return aging(items, asOf);
}

export async function apAgingReport(companyId: string, asOf: string): Promise<Aging> {
  const { data, error } = await getAdminSupabase()
    .from('supplier_bills')
    .select('id, number, due_date, total, paid_total, suppliers(name)')
    .eq('company_id', companyId)
    .in('status', ['open', 'partial'])
    .is('deleted_at', null)
    .limit(10_000);
  if (error) throw new InternalError(error);
  const items: AgingItem[] = (data ?? []).map((r) => {
    const sup = (r as unknown as { suppliers: { name: string } | { name: string }[] | null })
      .suppliers;
    const s = Array.isArray(sup) ? sup[0] : sup;
    return {
      id: String(r.id),
      party: s?.name ?? '',
      reference: String(r.number),
      dueDate: String(r.due_date),
      amount: Money.parseRounded(String(r.total)).sub(String(r.paid_total)).toDbString(),
    };
  });
  return aging(items, asOf);
}

export interface ReportQuery {
  from?: string;
  to?: string;
  asOf?: string;
  accountId?: string;
  compareFrom?: string;
  compareTo?: string;
}

/** One door for the reports API: the key says which report, the query gives the dates. */
export async function runReport(companyId: string, key: string, q: ReportQuery): Promise<unknown> {
  const today = new Date().toISOString().slice(0, 10);
  const asOf = q.asOf ?? q.to ?? today;
  const from = q.from ?? `${today.slice(0, 4)}-01-01`;
  const to = q.to ?? today;
  switch (key) {
    case 'trial_balance':
      return trialBalanceReport(companyId, asOf);
    case 'general_ledger':
      return generalLedgerReport(companyId, { from, to });
    case 'account_register':
      if (!q.accountId) throw new ValidationError('Choose an account.');
      return generalLedgerReport(companyId, { from, to, accountId: q.accountId });
    case 'profit_loss':
      return profitLossReport(
        companyId,
        from,
        to,
        q.compareFrom && q.compareTo ? { from: q.compareFrom, to: q.compareTo } : undefined,
      );
    case 'profit_loss_trend':
      return profitLossTrendReport(companyId, from, to);
    case 'balance_sheet':
      return balanceSheetReport(companyId, asOf, q.compareTo ?? q.compareFrom ?? undefined);
    case 'cash_flow':
      return cashFlowReport(companyId, from, to);
    case 'ar_aging':
      return arAgingReport(companyId, asOf);
    case 'ap_aging':
      return apAgingReport(companyId, asOf);
    case 'cash_balances':
      return cashBalanceReport(companyId, asOf);
    case 'tax_summary':
      return taxSummaryReport(companyId, from, to);
    case 'ratios':
      return ratiosReport(companyId, from, to);
    case 'expense_summary':
    case 'expense_by_account':
      return expenseSummaryReport(companyId, from, to);
    case 'expense_trend':
      return expenseTrendReport(companyId, from, to);
    default:
      throw new ValidationError('This report does not exist.');
  }
}
