// path: services/accounting/report-rules.ts
// The financial reports as pure functions over the account list and the ledger sums: trial balance, general ledger and
// account register, profit and loss (with comparison and monthly trend), balance sheet, cash flow (indirect), aging of
// receivables and payables, cash balances, tax summary, ratios and expense reports. No database here, so every report can be
// checked with a case table.
import { toInt } from '@/lib/reports/numbers';
import { Money } from '@/lib/utils/currency';

export type AccountType = 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';

export interface AccountMeta {
  id: string;
  code: string;
  name: string;
  type: AccountType;
  subtype: string;
  isContra: boolean;
  isCash: boolean;
  systemKey: string | null;
}

export interface Balance {
  accountId: string;
  debit: string;
  credit: string;
}

const zero = (): Money => Money.zero();
const m = (v: string): Money => Money.parse(v);

/** The balance in the natural direction of the account: debit minus credit for assets and expenses, the other way for the rest. */
export function natural(
  meta: Pick<AccountMeta, 'type' | 'isContra'>,
  b: Pick<Balance, 'debit' | 'credit'>,
): Money {
  const debitNormal = (meta.type === 'asset' || meta.type === 'expense') !== meta.isContra;
  return debitNormal ? m(b.debit).sub(b.credit) : m(b.credit).sub(b.debit);
}

/** The balance as it counts in its statement: a contra account (accumulated depreciation, refunds) reduces its section. */
export function signed(
  meta: Pick<AccountMeta, 'type' | 'isContra'>,
  b: Pick<Balance, 'debit' | 'credit'>,
): Money {
  const n = natural(meta, b);
  return meta.isContra ? n.negate() : n;
}

function indexBalances(balances: readonly Balance[]): Map<string, Balance> {
  return new Map(balances.map((b) => [b.accountId, b]));
}

/** Percent of `part` in `whole` with two decimals; null when the whole is zero. */
export function ratio(part: Money, whole: Money): string | null {
  if (whole.isZero()) return null;
  const { negative, integer, fraction } = part.mul('100').div(whole.toDbString()).toParts(2);
  return `${negative ? '-' : ''}${integer}.${fraction}`;
}

/** A plain ratio (for example 1.50) with two decimals; null when the divisor is zero. */
export function times(a: Money, b: Money): string | null {
  if (b.isZero()) return null;
  const { negative, integer, fraction } = a.div(b.toDbString()).toParts(2);
  return `${negative ? '-' : ''}${integer}.${fraction}`;
}

/* ---------- trial balance ---------- */

export interface TrialRow {
  accountId: string;
  code: string;
  name: string;
  type: AccountType;
  debit: string;
  credit: string;
}

export interface TrialBalance {
  rows: TrialRow[];
  totalDebit: string;
  totalCredit: string;
  balanced: boolean;
}

/** Each account shows its net balance in the debit or the credit column. Accounts with no balance are left out. */
export function trialBalance(
  accounts: readonly AccountMeta[],
  balances: readonly Balance[],
): TrialBalance {
  const by = indexBalances(balances);
  const rows: TrialRow[] = [];
  let td = zero();
  let tc = zero();
  for (const a of [...accounts].sort((x, y) => x.code.localeCompare(y.code))) {
    const b = by.get(a.id);
    if (!b) continue;
    const net = m(b.debit).sub(b.credit);
    if (net.isZero()) continue;
    const debit = net.isPositive() ? net : zero();
    const credit = net.isNegative() ? net.abs() : zero();
    td = td.add(debit);
    tc = tc.add(credit);
    rows.push({
      accountId: a.id,
      code: a.code,
      name: a.name,
      type: a.type,
      debit: debit.toDbString(),
      credit: credit.toDbString(),
    });
  }
  return { rows, totalDebit: td.toDbString(), totalCredit: tc.toDbString(), balanced: td.eq(tc) };
}

/* ---------- general ledger and account register ---------- */

export interface LedgerLine {
  entryId: string;
  date: string;
  number: string;
  memo: string;
  description: string;
  debit: string;
  credit: string;
}

export interface LedgerRow extends LedgerLine {
  balance: string;
}

export interface LedgerAccount {
  accountId: string;
  code: string;
  name: string;
  opening: string;
  rows: LedgerRow[];
  closing: string;
  totalDebit: string;
  totalCredit: string;
}

/** The lines of one account in date order with the running balance in the natural direction of the account. */
export function ledgerAccount(
  meta: AccountMeta,
  opening: Money,
  lines: readonly LedgerLine[],
): LedgerAccount {
  const sorted = [...lines].sort((a, b) =>
    a.date === b.date ? a.number.localeCompare(b.number) : a.date.localeCompare(b.date),
  );
  let run = opening;
  let td = zero();
  let tc = zero();
  const rows = sorted.map((l) => {
    run = run.add(natural(meta, l));
    td = td.add(l.debit);
    tc = tc.add(l.credit);
    return { ...l, balance: run.toDbString() };
  });
  return {
    accountId: meta.id,
    code: meta.code,
    name: meta.name,
    opening: opening.toDbString(),
    rows,
    closing: run.toDbString(),
    totalDebit: td.toDbString(),
    totalCredit: tc.toDbString(),
  };
}

/* ---------- profit and loss ---------- */

export interface ReportLine {
  accountId: string;
  code: string;
  name: string;
  amount: string;
  previous?: string;
  change?: string;
  changePercent?: string | null;
}

export interface Section {
  key: string;
  title: string;
  lines: ReportLine[];
  total: string;
}

export interface ProfitLoss {
  sections: Section[];
  revenue: string;
  costOfSales: string;
  grossProfit: string;
  operatingExpenses: string;
  operatingIncome: string;
  otherIncome: string;
  otherExpenses: string;
  netIncome: string;
  grossMarginPercent: string | null;
  netMarginPercent: string | null;
}

function section(
  key: string,
  title: string,
  accounts: readonly AccountMeta[],
  by: Map<string, Balance>,
): { section: Section; total: Money } {
  const lines: ReportLine[] = [];
  let total = zero();
  for (const a of [...accounts].sort((x, y) => x.code.localeCompare(y.code))) {
    const b = by.get(a.id);
    if (!b) continue;
    const amount = signed(a, b);
    if (amount.isZero()) continue;
    total = total.add(amount);
    lines.push({ accountId: a.id, code: a.code, name: a.name, amount: amount.toDbString() });
  }
  return { section: { key, title, lines, total: total.toDbString() }, total };
}

export function profitAndLoss(
  accounts: readonly AccountMeta[],
  balances: readonly Balance[],
): ProfitLoss {
  const by = indexBalances(balances);
  const pick = (sub: string): AccountMeta[] => accounts.filter((a) => a.subtype === sub);
  const rev = section('revenue', 'Revenue', pick('operating_revenue'), by);
  const cos = section('cost_of_sales', 'Cost of sales', pick('cost_of_sales'), by);
  const opx = section('operating_expense', 'Operating expenses', pick('operating_expense'), by);
  const oin = section('other_income', 'Other income', pick('other_income'), by);
  const oex = section('other_expense', 'Other expenses', pick('other_expense'), by);
  const gross = rev.total.sub(cos.total);
  const operating = gross.sub(opx.total);
  const net = operating.add(oin.total).sub(oex.total);
  return {
    sections: [rev.section, cos.section, opx.section, oin.section, oex.section],
    revenue: rev.total.toDbString(),
    costOfSales: cos.total.toDbString(),
    grossProfit: gross.toDbString(),
    operatingExpenses: opx.total.toDbString(),
    operatingIncome: operating.toDbString(),
    otherIncome: oin.total.toDbString(),
    otherExpenses: oex.total.toDbString(),
    netIncome: net.toDbString(),
    grossMarginPercent: ratio(gross, rev.total),
    netMarginPercent: ratio(net, rev.total),
  };
}

/** Adds the previous period to each line and the change (also lines that exist only in one period). */
export function withComparison(
  current: readonly Section[],
  previous: readonly Section[],
): Section[] {
  const prevBy = new Map<string, ReportLine>();
  for (const s of previous) for (const l of s.lines) prevBy.set(`${s.key}:${l.accountId}`, l);
  return current.map((s) => {
    const seen = new Set<string>();
    const lines: ReportLine[] = s.lines.map((l) => {
      const p = prevBy.get(`${s.key}:${l.accountId}`);
      seen.add(l.accountId);
      return compared(l, p ? m(p.amount) : zero());
    });
    for (const [key, p] of prevBy) {
      const [k, id] = key.split(':');
      if (k === s.key && id && !seen.has(id))
        lines.push(compared({ ...p, amount: '0.0000' }, m(p.amount)));
    }
    lines.sort((a, b) => a.code.localeCompare(b.code));
    return { ...s, lines };
  });
}

function compared(line: ReportLine, previous: Money): ReportLine {
  const cur = m(line.amount);
  const change = cur.sub(previous);
  return {
    ...line,
    previous: previous.toDbString(),
    change: change.toDbString(),
    changePercent: ratio(change, previous.abs()),
  };
}

export interface MonthColumn {
  month: string;
  revenue: string;
  expenses: string;
  netIncome: string;
}

/** Revenue, expenses and result for each month of a range (for the trend chart and the monthly P&L). */
export function monthlyTrend(
  accounts: readonly AccountMeta[],
  months: readonly string[],
  byMonth: ReadonlyMap<string, readonly Balance[]>,
): MonthColumn[] {
  return months.map((month) => {
    const pl = profitAndLoss(accounts, byMonth.get(month) ?? []);
    const expenses = m(pl.costOfSales).add(pl.operatingExpenses).add(pl.otherExpenses);
    return {
      month,
      revenue: m(pl.revenue).add(pl.otherIncome).toDbString(),
      expenses: expenses.toDbString(),
      netIncome: pl.netIncome,
    };
  });
}

/** "2026-01" to "2026-03" as a list of months. */
export function monthsBetween(from: string, to: string): string[] {
  const out: string[] = [];
  let y = toInt(from.slice(0, 4));
  let mo = toInt(from.slice(5, 7));
  const endY = toInt(to.slice(0, 4));
  const endM = toInt(to.slice(5, 7));
  while ((y < endY || (y === endY && mo <= endM)) && out.length < 60) {
    out.push(`${String(y).padStart(4, '0')}-${String(mo).padStart(2, '0')}`);
    mo += 1;
    if (mo > 12) {
      mo = 1;
      y += 1;
    }
  }
  return out;
}

/* ---------- balance sheet ---------- */

export interface BalanceSheet {
  assets: Section[];
  liabilities: Section[];
  equity: Section[];
  totalAssets: string;
  totalLiabilities: string;
  totalEquity: string;
  /** Result of the revenue and expense accounts that no closing entry has taken to retained earnings yet. */
  currentEarnings: string;
  balanced: boolean;
  difference: string;
}

/** `balances` are the sums of all posted entries up to the date, closing entries included. */
export function balanceSheet(
  accounts: readonly AccountMeta[],
  balances: readonly Balance[],
): BalanceSheet {
  const by = indexBalances(balances);
  const pick = (sub: string): AccountMeta[] => accounts.filter((a) => a.subtype === sub);
  const ca = section('current_asset', 'Current assets', pick('current_asset'), by);
  const fa = section('fixed_asset', 'Fixed assets', pick('fixed_asset'), by);
  const oa = section('other_asset', 'Other assets', pick('other_asset'), by);
  const cl = section('current_liability', 'Current liabilities', pick('current_liability'), by);
  const ll = section(
    'long_term_liability',
    'Long-term liabilities',
    pick('long_term_liability'),
    by,
  );
  const oe = section('owner_equity', 'Owner equity', pick('owner_equity'), by);
  const re = section('retained_earnings', 'Retained earnings', pick('retained_earnings'), by);
  const pl = profitAndLoss(accounts, balances);
  const earnings = m(pl.netIncome);
  const equityTotal = oe.total.add(re.total).add(earnings);
  const assetsTotal = ca.total.add(fa.total).add(oa.total);
  const liabTotal = cl.total.add(ll.total);
  const diff = assetsTotal.sub(liabTotal.add(equityTotal));
  const earningsSection: Section = {
    key: 'current_earnings',
    title: 'Current year earnings',
    lines: earnings.isZero()
      ? []
      : [
          {
            accountId: 'current_earnings',
            code: '',
            name: 'Current year earnings',
            amount: earnings.toDbString(),
          },
        ],
    total: earnings.toDbString(),
  };
  return {
    assets: [ca.section, fa.section, oa.section],
    liabilities: [cl.section, ll.section],
    equity: [oe.section, re.section, earningsSection],
    totalAssets: assetsTotal.toDbString(),
    totalLiabilities: liabTotal.toDbString(),
    totalEquity: equityTotal.toDbString(),
    currentEarnings: earnings.toDbString(),
    balanced: diff.isZero(),
    difference: diff.toDbString(),
  };
}

/* ---------- cash flow (indirect) ---------- */

export interface CashFlowLine {
  label: string;
  amount: string;
}

export interface CashFlow {
  netIncome: string;
  operating: CashFlowLine[];
  investing: CashFlowLine[];
  financing: CashFlowLine[];
  operatingTotal: string;
  investingTotal: string;
  financingTotal: string;
  netChange: string;
  openingCash: string;
  closingCash: string;
  /** Closing cash less opening cash less the net change; zero when the statement ties out. */
  difference: string;
  reconciled: boolean;
}

function totalOf(
  accounts: readonly AccountMeta[],
  by: Map<string, Balance>,
  pred: (a: AccountMeta) => boolean,
): Money {
  return Money.sum(
    accounts.filter(pred).map((a) => {
      const b = by.get(a.id);
      return b ? signed(a, b) : zero();
    }),
  );
}

/**
 * Cash flow by the indirect method. `open` and `close` are cumulative balances (closing entries included) before the first day
 * and at the last day; `netIncome` is the result of the period. Working capital accounts give the operating lines, fixed and
 * other assets the investing lines, loans and equity the financing lines. Direct movements in retained earnings are shown as
 * other equity movements.
 */
export function cashFlowIndirect(
  accounts: readonly AccountMeta[],
  open: readonly Balance[],
  close: readonly Balance[],
  netIncome: Money,
): CashFlow {
  const ob = indexBalances(open);
  const cb = indexBalances(close);
  const change = (pred: (a: AccountMeta) => boolean): Money =>
    totalOf(accounts, cb, pred).sub(totalOf(accounts, ob, pred));
  const isDep = (a: AccountMeta): boolean => a.systemKey === 'accumulated_depreciation';
  const operating: CashFlowLine[] = [];
  const add = (list: CashFlowLine[], label: string, amount: Money): void => {
    if (!amount.isZero()) list.push({ label, amount: amount.toDbString() });
  };
  add(operating, 'Depreciation and amortization', change(isDep).negate());
  const nonCashCurrentAssets = (a: AccountMeta): boolean =>
    a.subtype === 'current_asset' && !a.isCash;
  for (const a of accounts
    .filter(nonCashCurrentAssets)
    .sort((x, y) => x.code.localeCompare(y.code))) {
    add(operating, `Change in ${a.name.toLowerCase()}`, change((x) => x.id === a.id).negate());
  }
  for (const a of accounts
    .filter((x) => x.subtype === 'current_liability')
    .sort((x, y) => x.code.localeCompare(y.code))) {
    add(
      operating,
      `Change in ${a.name.toLowerCase()}`,
      change((x) => x.id === a.id),
    );
  }
  const investing: CashFlowLine[] = [];
  for (const a of accounts
    .filter(
      (x) => (x.subtype === 'fixed_asset' || x.subtype === 'other_asset') && !isDep(x) && !x.isCash,
    )
    .sort((x, y) => x.code.localeCompare(y.code))) {
    add(investing, `Change in ${a.name.toLowerCase()}`, change((x) => x.id === a.id).negate());
  }
  const financing: CashFlowLine[] = [];
  for (const a of accounts
    .filter((x) => x.subtype === 'long_term_liability' || x.subtype === 'owner_equity')
    .sort((x, y) => x.code.localeCompare(y.code))) {
    add(
      financing,
      `Change in ${a.name.toLowerCase()}`,
      change((x) => x.id === a.id),
    );
  }
  // Retained earnings move with the result of the year (through a closing entry or not). What is left over was booked directly.
  const revenueNet = totalOf(accounts, cb, (a) => a.type === 'revenue').sub(
    totalOf(accounts, ob, (a) => a.type === 'revenue'),
  );
  const expenseNet = totalOf(accounts, cb, (a) => a.type === 'expense').sub(
    totalOf(accounts, ob, (a) => a.type === 'expense'),
  );
  const reChange = change((a) => a.subtype === 'retained_earnings').add(revenueNet.sub(expenseNet));
  add(financing, 'Other equity movements', reChange.sub(netIncome));
  const sum = (l: CashFlowLine[]): Money => Money.sum(l.map((x) => m(x.amount)));
  const opTotal = netIncome.add(sum(operating));
  const invTotal = sum(investing);
  const finTotal = sum(financing);
  const netChange = opTotal.add(invTotal).add(finTotal);
  const openingCash = totalOf(accounts, ob, (a) => a.isCash);
  const closingCash = totalOf(accounts, cb, (a) => a.isCash);
  const diff = closingCash.sub(openingCash).sub(netChange);
  return {
    netIncome: netIncome.toDbString(),
    operating,
    investing,
    financing,
    operatingTotal: opTotal.toDbString(),
    investingTotal: invTotal.toDbString(),
    financingTotal: finTotal.toDbString(),
    netChange: netChange.toDbString(),
    openingCash: openingCash.toDbString(),
    closingCash: closingCash.toDbString(),
    difference: diff.toDbString(),
    reconciled: diff.isZero(),
  };
}

/* ---------- cash balances ---------- */

export interface CashBalanceRow {
  accountId: string;
  code: string;
  name: string;
  balance: string;
}

export function cashBalances(
  accounts: readonly AccountMeta[],
  balances: readonly Balance[],
): { rows: CashBalanceRow[]; total: string } {
  const by = indexBalances(balances);
  const rows: CashBalanceRow[] = [];
  let total = zero();
  for (const a of accounts.filter((x) => x.isCash).sort((x, y) => x.code.localeCompare(y.code))) {
    const b = by.get(a.id);
    const amount = b ? signed(a, b) : zero();
    total = total.add(amount);
    rows.push({ accountId: a.id, code: a.code, name: a.name, balance: amount.toDbString() });
  }
  return { rows, total: total.toDbString() };
}

/* ---------- aging ---------- */

export const AGING_BUCKETS = [
  'current',
  'days_1_30',
  'days_31_60',
  'days_61_90',
  'days_91_120',
  'days_over_120',
] as const;
export type AgingBucket = (typeof AGING_BUCKETS)[number];

export interface AgingItem {
  id: string;
  party: string;
  reference: string;
  dueDate: string;
  amount: string;
}

export interface AgingRow extends AgingItem {
  daysOverdue: number;
  bucket: AgingBucket;
}

export interface Aging {
  asOf: string;
  rows: AgingRow[];
  totals: Record<AgingBucket, string>;
  total: string;
}

const DAY = 86_400_000;

export function bucketOf(daysOverdue: number): AgingBucket {
  if (daysOverdue <= 0) return 'current';
  if (daysOverdue <= 30) return 'days_1_30';
  if (daysOverdue <= 60) return 'days_31_60';
  if (daysOverdue <= 90) return 'days_61_90';
  if (daysOverdue <= 120) return 'days_91_120';
  return 'days_over_120';
}

/** Days past the due date at `asOf` (negative before it is due), computed on calendar days. */
export function daysOverdue(dueDate: string, asOf: string): number {
  return Math.round((Date.parse(`${asOf}T00:00:00Z`) - Date.parse(`${dueDate}T00:00:00Z`)) / DAY);
}

export function aging(items: readonly AgingItem[], asOf: string): Aging {
  const totals = Object.fromEntries(AGING_BUCKETS.map((b) => [b, zero()])) as Record<
    AgingBucket,
    Money
  >;
  const rows = items
    .filter((i) => m(i.amount).isPositive())
    .map((i) => {
      const d = daysOverdue(i.dueDate, asOf);
      const bucket = bucketOf(d);
      totals[bucket] = totals[bucket].add(i.amount);
      return { ...i, daysOverdue: Math.max(d, 0), bucket };
    })
    .sort((a, b) => b.daysOverdue - a.daysOverdue || a.party.localeCompare(b.party));
  const total = Money.sum(Object.values(totals));
  return {
    asOf,
    rows,
    totals: Object.fromEntries(AGING_BUCKETS.map((b) => [b, totals[b].toDbString()])) as Record<
      AgingBucket,
      string
    >,
    total: total.toDbString(),
  };
}

/* ---------- tax summary ---------- */

export interface TaxSummary {
  collected: string;
  paidOnPurchases: string;
  netPayable: string;
  /** Tax collected on sales, by account. */
  collectedLines: ReportLine[];
  paidLines: ReportLine[];
}

/**
 * Tax collected (credits to tax payable accounts less debits that are not payments) against tax paid on purchases (debits
 * to tax receivable accounts). Both come from the activity of the period, not from the balance.
 */
export function taxSummary(
  accounts: readonly AccountMeta[],
  activity: readonly Balance[],
): TaxSummary {
  const by = indexBalances(activity);
  const pay = accounts.filter((a) => a.systemKey === 'tax_payable');
  const rec = accounts.filter((a) => a.systemKey === 'tax_receivable');
  const collectedLines: ReportLine[] = [];
  const paidLines: ReportLine[] = [];
  let collected = zero();
  let paid = zero();
  for (const a of pay) {
    const b = by.get(a.id);
    if (!b) continue;
    const amount = m(b.credit);
    if (amount.isZero()) continue;
    collected = collected.add(amount);
    collectedLines.push({
      accountId: a.id,
      code: a.code,
      name: a.name,
      amount: amount.toDbString(),
    });
  }
  for (const a of rec) {
    const b = by.get(a.id);
    if (!b) continue;
    const amount = m(b.debit);
    if (amount.isZero()) continue;
    paid = paid.add(amount);
    paidLines.push({ accountId: a.id, code: a.code, name: a.name, amount: amount.toDbString() });
  }
  return {
    collected: collected.toDbString(),
    paidOnPurchases: paid.toDbString(),
    netPayable: collected.sub(paid).toDbString(),
    collectedLines,
    paidLines,
  };
}

/* ---------- ratios ---------- */

export interface Ratios {
  currentRatio: string | null;
  quickRatio: string | null;
  debtToEquity: string | null;
  workingCapital: string;
  grossMarginPercent: string | null;
  netMarginPercent: string | null;
  returnOnEquityPercent: string | null;
}

export function ratios(
  accounts: readonly AccountMeta[],
  sheet: BalanceSheet,
  period: ProfitLoss,
  closing: readonly Balance[],
): Ratios {
  const by = indexBalances(closing);
  const currentAssets = Money.sum(
    sheet.assets.filter((s) => s.key === 'current_asset').map((s) => m(s.total)),
  );
  const currentLiabilities = Money.sum(
    sheet.liabilities.filter((s) => s.key === 'current_liability').map((s) => m(s.total)),
  );
  const cash = totalOf(accounts, by, (a) => a.isCash);
  const receivable = totalOf(accounts, by, (a) => a.systemKey === 'accounts_receivable');
  const equity = m(sheet.totalEquity);
  return {
    currentRatio: times(currentAssets, currentLiabilities),
    quickRatio: times(cash.add(receivable), currentLiabilities),
    debtToEquity: times(m(sheet.totalLiabilities), equity),
    workingCapital: currentAssets.sub(currentLiabilities).toDbString(),
    grossMarginPercent: period.grossMarginPercent,
    netMarginPercent: period.netMarginPercent,
    returnOnEquityPercent: ratio(m(period.netIncome), equity),
  };
}

/* ---------- expense reports ---------- */

export interface ExpenseRow {
  accountId: string;
  code: string;
  name: string;
  amount: string;
  sharePercent: string | null;
}

export interface ExpenseSummary {
  total: string;
  rows: ExpenseRow[];
}

/** Expense accounts of a period, biggest first, with their share of the total. Cost of sales, operating and other expenses. */
export function expenseSummary(
  accounts: readonly AccountMeta[],
  balances: readonly Balance[],
): ExpenseSummary {
  const by = indexBalances(balances);
  const list = accounts.filter((a) => a.type === 'expense');
  const rows: ExpenseRow[] = [];
  let total = zero();
  for (const a of list) {
    const b = by.get(a.id);
    if (!b) continue;
    const amount = signed(a, b);
    if (amount.isZero()) continue;
    total = total.add(amount);
    rows.push({
      accountId: a.id,
      code: a.code,
      name: a.name,
      amount: amount.toDbString(),
      sharePercent: null,
    });
  }
  rows.sort((x, y) =>
    m(y.amount).gt(x.amount) ? 1 : m(y.amount).lt(x.amount) ? -1 : x.code.localeCompare(y.code),
  );
  return {
    total: total.toDbString(),
    rows: rows.map((r) => ({ ...r, sharePercent: ratio(m(r.amount), total) })),
  };
}

export interface ExpenseTrendRow {
  accountId: string;
  code: string;
  name: string;
  months: string[];
  total: string;
}

/** Each expense account by month (the same month list for all rows). */
export function expenseTrend(
  accounts: readonly AccountMeta[],
  months: readonly string[],
  byMonth: ReadonlyMap<string, readonly Balance[]>,
): ExpenseTrendRow[] {
  const perMonth = months.map((mo) => indexBalances(byMonth.get(mo) ?? []));
  const out: ExpenseTrendRow[] = [];
  for (const a of accounts
    .filter((x) => x.type === 'expense')
    .sort((x, y) => x.code.localeCompare(y.code))) {
    const values = perMonth.map((by) => {
      const b = by.get(a.id);
      return b ? signed(a, b) : zero();
    });
    const total = Money.sum(values);
    if (total.isZero() && values.every((v) => v.isZero())) continue;
    out.push({
      accountId: a.id,
      code: a.code,
      name: a.name,
      months: values.map((v) => v.toDbString()),
      total: total.toDbString(),
    });
  }
  return out;
}
