// path: services/accounting/report-tables.ts
// Turns each accounting report into the flat table (`ReportResult`) that the platform's CSV, Excel and PDF exports draw.
// Pure: section headings, totals and checks become rows so a printed report reads like the screen.
import type { ReportColumn, ReportResult } from '@/lib/reports/types';
import type {
  Aging,
  BalanceSheet,
  CashFlow,
  ExpenseSummary,
  ExpenseTrendRow,
  LedgerAccount,
  MonthColumn,
  ProfitLoss,
  Ratios,
  Section,
  TaxSummary,
  TrialBalance,
} from './report-rules';

type Row = Record<string, string>;

const col = (key: string, label: string, type: ReportColumn['type'] = 'text'): ReportColumn => ({
  key,
  label,
  type,
});

function result(
  key: string,
  title: string,
  period: ReportResult['period'],
  columns: ReportColumn[],
  rows: Row[],
  totals: Row | null,
  notes: string[] = [],
): ReportResult {
  return { key, title, period, columns, rows, totals, notes };
}

export function trialBalanceTable(r: TrialBalance & { asOf: string }): ReportResult {
  return result(
    'trial_balance',
    'Trial balance',
    null,
    [
      col('code', 'Account'),
      col('name', 'Name'),
      col('debit', 'Debit', 'money'),
      col('credit', 'Credit', 'money'),
    ],
    r.rows.map((x) => ({ code: x.code, name: x.name, debit: x.debit, credit: x.credit })),
    { code: 'Total', name: '', debit: r.totalDebit, credit: r.totalCredit },
    [`As of ${r.asOf}`, r.balanced ? 'Debits equal credits.' : 'Debits and credits are NOT equal.'],
  );
}

export function ledgerTable(
  key: 'general_ledger' | 'account_register',
  r: { from: string; to: string; accounts: LedgerAccount[]; truncated: boolean },
): ReportResult {
  const rows: Row[] = [];
  for (const a of r.accounts) {
    const head = `${a.code} ${a.name}`;
    rows.push({
      date: '',
      number: '',
      account: head,
      memo: 'Opening balance',
      debit: '',
      credit: '',
      balance: a.opening,
    });
    for (const l of a.rows)
      rows.push({
        date: l.date,
        number: l.number,
        account: head,
        memo: l.description || l.memo,
        debit: l.debit,
        credit: l.credit,
        balance: l.balance,
      });
    rows.push({
      date: '',
      number: '',
      account: head,
      memo: 'Closing balance',
      debit: a.totalDebit,
      credit: a.totalCredit,
      balance: a.closing,
    });
  }
  return result(
    key,
    key === 'general_ledger' ? 'General ledger' : 'Account register',
    { from: r.from, to: r.to },
    [
      col('date', 'Date', 'date'),
      col('number', 'Entry'),
      col('account', 'Account'),
      col('memo', 'Description'),
      col('debit', 'Debit', 'money'),
      col('credit', 'Credit', 'money'),
      col('balance', 'Balance', 'money'),
    ],
    rows,
    null,
    r.truncated ? ['The ledger was cut at 5000 lines. Choose a shorter period.'] : [],
  );
}

function sectionRows(sections: readonly Section[], withComparison: boolean): Row[] {
  const rows: Row[] = [];
  for (const s of sections) {
    if (s.lines.length === 0 && s.key === 'current_earnings') continue;
    rows.push({ code: '', name: s.title, amount: '', previous: '', change: '', percent: '' });
    for (const l of s.lines) {
      rows.push({
        code: l.code,
        name: l.name,
        amount: l.amount,
        previous: withComparison ? (l.previous ?? '') : '',
        change: withComparison ? (l.change ?? '') : '',
        percent: withComparison ? (l.changePercent ?? '') : '',
      });
    }
    rows.push({
      code: '',
      name: `Total ${s.title.toLowerCase()}`,
      amount: s.total,
      previous: '',
      change: '',
      percent: '',
    });
  }
  return rows;
}

const amountColumns = (withComparison: boolean): ReportColumn[] => [
  col('code', 'Account'),
  col('name', 'Name'),
  col('amount', 'Amount', 'money'),
  ...(withComparison
    ? [
        col('previous', 'Previous period', 'money'),
        col('change', 'Change', 'money'),
        col('percent', 'Change percent', 'percent'),
      ]
    : []),
];

export function profitLossTable(
  r: ProfitLoss & { from: string; to: string; compare: { from: string; to: string } | null },
): ReportResult {
  const cmp = r.compare !== null;
  const rows = sectionRows(r.sections, cmp);
  const line = (name: string, amount: string): Row => ({
    code: '',
    name,
    amount,
    previous: '',
    change: '',
    percent: '',
  });
  rows.push(
    line('Gross profit', r.grossProfit),
    line('Operating income', r.operatingIncome),
    line('Net income', r.netIncome),
  );
  return result(
    'profit_loss',
    'Profit and loss',
    { from: r.from, to: r.to },
    amountColumns(cmp),
    rows,
    null,
    [
      ...(r.compare ? [`Compared with ${r.compare.from} to ${r.compare.to}`] : []),
      ...(r.grossMarginPercent ? [`Gross margin ${r.grossMarginPercent} percent`] : []),
      ...(r.netMarginPercent ? [`Net margin ${r.netMarginPercent} percent`] : []),
    ],
  );
}

export function profitLossTrendTable(r: {
  from: string;
  to: string;
  months: MonthColumn[];
}): ReportResult {
  return result(
    'profit_loss_trend',
    'Profit and loss by month',
    { from: r.from, to: r.to },
    [
      col('month', 'Month'),
      col('revenue', 'Revenue', 'money'),
      col('expenses', 'Expenses', 'money'),
      col('netIncome', 'Net income', 'money'),
    ],
    r.months.map((m) => ({
      month: m.month,
      revenue: m.revenue,
      expenses: m.expenses,
      netIncome: m.netIncome,
    })),
    null,
  );
}

export function balanceSheetTable(r: BalanceSheet & { asOf: string }): ReportResult {
  const rows: Row[] = [];
  const add = (title: string, sections: Section[], total: string): void => {
    rows.push(
      { code: '', name: title, amount: '' },
      ...sectionRows(sections, false).map((x) => ({
        code: x.code ?? '',
        name: x.name ?? '',
        amount: x.amount ?? '',
      })),
    );
    rows.push({ code: '', name: `Total ${title.toLowerCase()}`, amount: total });
  };
  add('Assets', r.assets, r.totalAssets);
  add('Liabilities', r.liabilities, r.totalLiabilities);
  add('Equity', r.equity, r.totalEquity);
  return result('balance_sheet', 'Balance sheet', null, amountColumns(false), rows, null, [
    `As of ${r.asOf}`,
    r.balanced
      ? 'Assets equal liabilities plus equity.'
      : `Assets differ from liabilities plus equity by ${r.difference}.`,
  ]);
}

export function cashFlowTable(r: CashFlow & { from: string; to: string }): ReportResult {
  const rows: Row[] = [
    { label: 'Net income', amount: r.netIncome },
    { label: 'Operating activities', amount: '' },
  ];
  for (const l of r.operating) rows.push({ label: l.label, amount: l.amount });
  rows.push(
    { label: 'Cash from operating activities', amount: r.operatingTotal },
    { label: 'Investing activities', amount: '' },
  );
  for (const l of r.investing) rows.push({ label: l.label, amount: l.amount });
  rows.push(
    { label: 'Cash from investing activities', amount: r.investingTotal },
    { label: 'Financing activities', amount: '' },
  );
  for (const l of r.financing) rows.push({ label: l.label, amount: l.amount });
  rows.push(
    { label: 'Cash from financing activities', amount: r.financingTotal },
    { label: 'Net change in cash', amount: r.netChange },
    { label: 'Cash at the start', amount: r.openingCash },
    { label: 'Cash at the end', amount: r.closingCash },
  );
  return result(
    'cash_flow',
    'Cash flow statement',
    { from: r.from, to: r.to },
    [col('label', 'Item'), col('amount', 'Amount', 'money')],
    rows,
    null,
    [
      r.reconciled
        ? 'The statement ties out to the cash accounts.'
        : `The statement differs from the cash accounts by ${r.difference}.`,
    ],
  );
}

export function agingTable(key: 'ar_aging' | 'ap_aging', a: Aging): ReportResult {
  const labels: Record<string, string> = {
    current: 'Current',
    days_1_30: '1 to 30 days',
    days_31_60: '31 to 60 days',
    days_61_90: '61 to 90 days',
    days_91_120: '91 to 120 days',
    days_over_120: 'Over 120 days',
  };
  return result(
    key,
    key === 'ar_aging' ? 'Receivables aging' : 'Payables aging',
    null,
    [
      col('party', key === 'ar_aging' ? 'Client' : 'Supplier'),
      col('reference', 'Document'),
      col('dueDate', 'Due', 'date'),
      col('days', 'Days past due', 'number'),
      col('bucket', 'Group'),
      col('amount', 'Amount', 'money'),
    ],
    a.rows.map((x) => ({
      party: x.party,
      reference: x.reference,
      dueDate: x.dueDate,
      days: String(x.daysOverdue),
      bucket: labels[x.bucket] ?? x.bucket,
      amount: x.amount,
    })),
    { party: 'Total', reference: '', dueDate: '', days: '', bucket: '', amount: a.total },
    [`As of ${a.asOf}`, ...Object.entries(a.totals).map(([k, v]) => `${labels[k] ?? k}: ${v}`)],
  );
}

export function cashBalancesTable(r: {
  asOf: string;
  rows: { code: string; name: string; balance: string }[];
  total: string;
}): ReportResult {
  return result(
    'cash_balances',
    'Cash balances',
    null,
    [col('code', 'Account'), col('name', 'Name'), col('balance', 'Balance', 'money')],
    r.rows.map((x) => ({ code: x.code, name: x.name, balance: x.balance })),
    { code: 'Total', name: '', balance: r.total },
    [`As of ${r.asOf}`],
  );
}

export function taxSummaryTable(r: TaxSummary & { from: string; to: string }): ReportResult {
  const rows: Row[] = [
    { label: 'Tax collected on sales', amount: '' },
    ...r.collectedLines.map((l) => ({ label: `${l.code} ${l.name}`, amount: l.amount })),
    { label: 'Total tax collected', amount: r.collected },
    { label: 'Tax paid on purchases', amount: '' },
    ...r.paidLines.map((l) => ({ label: `${l.code} ${l.name}`, amount: l.amount })),
    { label: 'Total tax paid', amount: r.paidOnPurchases },
    { label: 'Net tax payable', amount: r.netPayable },
  ];
  return result(
    'tax_summary',
    'Tax summary',
    { from: r.from, to: r.to },
    [col('label', 'Item'), col('amount', 'Amount', 'money')],
    rows,
    null,
  );
}

export function ratiosTable(r: Ratios & { from: string; to: string }): ReportResult {
  const v = (x: string | null): string => x ?? 'n/a';
  return result(
    'ratios',
    'Financial ratios',
    { from: r.from, to: r.to },
    [col('name', 'Ratio'), col('value', 'Value', 'text')],
    [
      { name: 'Current ratio', value: v(r.currentRatio) },
      { name: 'Quick ratio', value: v(r.quickRatio) },
      { name: 'Debt to equity', value: v(r.debtToEquity) },
      { name: 'Working capital', value: r.workingCapital },
      { name: 'Gross margin percent', value: v(r.grossMarginPercent) },
      { name: 'Net margin percent', value: v(r.netMarginPercent) },
      { name: 'Return on equity percent', value: v(r.returnOnEquityPercent) },
    ],
    null,
  );
}

export function expenseTable(
  key: 'expense_summary' | 'expense_by_account',
  r: ExpenseSummary & { from: string; to: string },
): ReportResult {
  return result(
    key,
    key === 'expense_summary' ? 'Expense summary' : 'Expenses by category',
    { from: r.from, to: r.to },
    [
      col('code', 'Account'),
      col('name', 'Name'),
      col('amount', 'Amount', 'money'),
      col('share', 'Share', 'percent'),
    ],
    r.rows.map((x) => ({
      code: x.code,
      name: x.name,
      amount: x.amount,
      share: x.sharePercent ?? '',
    })),
    { code: 'Total', name: '', amount: r.total, share: '' },
  );
}

export function expenseTrendTable(r: {
  from: string;
  to: string;
  months: string[];
  rows: ExpenseTrendRow[];
}): ReportResult {
  const columns = [
    col('name', 'Account'),
    ...r.months.map((m) => col(`m_${m}`, m, 'money')),
    col('total', 'Total', 'money'),
  ];
  const rows = r.rows.map((x) => ({
    name: `${x.code} ${x.name}`,
    ...Object.fromEntries(r.months.map((m, i) => [`m_${m}`, x.months[i] ?? '0.0000'])),
    total: x.total,
  }));
  return result('expense_trend', 'Expense trend', { from: r.from, to: r.to }, columns, rows, null);
}
