// path: config/s15-accounting.ts
// Accounting constants (STEP 15): the starting chart, industry presets, country templates, the keys a kind of
// transaction posts to, and the limits of imports.
export type AccountType = 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';
export type AccountSubtype =
  | 'current_asset'
  | 'fixed_asset'
  | 'other_asset'
  | 'current_liability'
  | 'long_term_liability'
  | 'owner_equity'
  | 'retained_earnings'
  | 'operating_revenue'
  | 'other_income'
  | 'cost_of_sales'
  | 'operating_expense'
  | 'other_expense';

export const ACCOUNT_TYPES: readonly AccountType[] = [
  'asset',
  'liability',
  'equity',
  'revenue',
  'expense',
];
export const SUBTYPES_BY_TYPE: Readonly<Record<AccountType, readonly AccountSubtype[]>> = {
  asset: ['current_asset', 'fixed_asset', 'other_asset'],
  liability: ['current_liability', 'long_term_liability'],
  equity: ['owner_equity', 'retained_earnings'],
  revenue: ['operating_revenue', 'other_income'],
  expense: ['cost_of_sales', 'operating_expense', 'other_expense'],
};

/** The keys a kind of transaction posts to. Each one points at an account of the company (and can be re-mapped). */
export const MAPPING_KEYS = [
  'bank',
  'accounts_receivable',
  'accounts_payable',
  'revenue',
  'refunds',
  'tax_payable',
  'tax_receivable',
  'customer_credit',
  'processor_fees',
  'default_expense',
  'payroll_expense',
  'payroll_tax_expense',
  'payroll_liability',
  'fixed_assets',
  'accumulated_depreciation',
  'depreciation_expense',
  'fx_gain_loss',
  'retained_earnings',
  'suspense',
  'wallet_balance',
  'chargeback_expense',
  'disposal_gain_loss',
] as const;
export type MappingKey = (typeof MAPPING_KEYS)[number];

export interface ChartSeed {
  code: string;
  name: string;
  type: AccountType;
  subtype: AccountSubtype;
  parent?: string;
  group?: boolean;
  contra?: boolean;
  /** A cash or bank account (the cash flow statement and the cash report use these). */
  cash?: boolean;
  key?: MappingKey;
  description?: string;
}

const a = (
  code: string,
  name: string,
  type: AccountType,
  subtype: AccountSubtype,
  extra: Partial<ChartSeed> = {},
): ChartSeed => ({ code, name, type, subtype, ...extra });

/** The chart every company starts with (codes are hierarchical: 1000, 1100, 1110). */
export const BASE_CHART: readonly ChartSeed[] = [
  a('1000', 'Assets', 'asset', 'current_asset', { group: true }),
  a('1100', 'Current assets', 'asset', 'current_asset', { group: true, parent: '1000' }),
  a('1110', 'Bank', 'asset', 'current_asset', { parent: '1100', key: 'bank', cash: true }),
  a('1120', 'Cash on hand', 'asset', 'current_asset', { parent: '1100', cash: true }),
  a('1130', 'Accounts receivable', 'asset', 'current_asset', {
    parent: '1100',
    key: 'accounts_receivable',
  }),
  a('1140', 'Tax receivable', 'asset', 'current_asset', { parent: '1100', key: 'tax_receivable' }),
  a('1150', 'Prepaid expenses', 'asset', 'current_asset', { parent: '1100' }),
  a('1170', 'Wallet balance held by the platform', 'asset', 'current_asset', {
    parent: '1100',
    key: 'wallet_balance',
    cash: true,
    description: 'Online payments settled into the company wallet and not yet paid out.',
  }),
  a('1190', 'Suspense', 'asset', 'current_asset', {
    parent: '1100',
    key: 'suspense',
    description: 'Money that waits for the right account.',
  }),
  a('1200', 'Fixed assets', 'asset', 'fixed_asset', { group: true, parent: '1000' }),
  a('1210', 'Equipment', 'asset', 'fixed_asset', { parent: '1200', key: 'fixed_assets' }),
  a('1290', 'Accumulated depreciation', 'asset', 'fixed_asset', {
    parent: '1200',
    contra: true,
    key: 'accumulated_depreciation',
  }),
  a('2000', 'Liabilities', 'liability', 'current_liability', { group: true }),
  a('2100', 'Current liabilities', 'liability', 'current_liability', {
    group: true,
    parent: '2000',
  }),
  a('2110', 'Accounts payable', 'liability', 'current_liability', {
    parent: '2100',
    key: 'accounts_payable',
  }),
  a('2120', 'Tax payable', 'liability', 'current_liability', {
    parent: '2100',
    key: 'tax_payable',
  }),
  a('2130', 'Payroll liabilities', 'liability', 'current_liability', {
    parent: '2100',
    key: 'payroll_liability',
  }),
  a('2140', 'Customer credits and deposits', 'liability', 'current_liability', {
    parent: '2100',
    key: 'customer_credit',
  }),
  a('2150', 'Accrued expenses', 'liability', 'current_liability', { parent: '2100' }),
  a('2500', 'Long-term liabilities', 'liability', 'long_term_liability', {
    group: true,
    parent: '2000',
  }),
  a('2510', 'Loans', 'liability', 'long_term_liability', { parent: '2500' }),
  a('3000', 'Equity', 'equity', 'owner_equity', { group: true }),
  a('3100', 'Owner equity', 'equity', 'owner_equity', { parent: '3000' }),
  a('3200', 'Retained earnings', 'equity', 'retained_earnings', {
    parent: '3000',
    key: 'retained_earnings',
  }),
  a('4000', 'Revenue', 'revenue', 'operating_revenue', { group: true }),
  a('4100', 'Sales revenue', 'revenue', 'operating_revenue', { parent: '4000', key: 'revenue' }),
  a('4200', 'Other income', 'revenue', 'other_income', { parent: '4000' }),
  a('4900', 'Refunds and credits', 'revenue', 'operating_revenue', {
    parent: '4000',
    contra: true,
    key: 'refunds',
  }),
  a('5000', 'Cost of sales', 'expense', 'cost_of_sales', { group: true }),
  a('5100', 'Cost of goods sold', 'expense', 'cost_of_sales', { parent: '5000' }),
  a('6000', 'Operating expenses', 'expense', 'operating_expense', { group: true }),
  a('6100', 'General expenses', 'expense', 'operating_expense', {
    parent: '6000',
    key: 'default_expense',
  }),
  a('6200', 'Salaries and wages', 'expense', 'operating_expense', {
    parent: '6000',
    key: 'payroll_expense',
  }),
  a('6210', 'Payroll taxes and contributions', 'expense', 'operating_expense', {
    parent: '6000',
    key: 'payroll_tax_expense',
  }),
  a('6300', 'Depreciation expense', 'expense', 'operating_expense', {
    parent: '6000',
    key: 'depreciation_expense',
  }),
  a('6400', 'Payment processing fees', 'expense', 'operating_expense', {
    parent: '6000',
    key: 'processor_fees',
  }),
  a('6410', 'Chargebacks and disputes', 'expense', 'operating_expense', {
    parent: '6000',
    key: 'chargeback_expense',
  }),
  a('6500', 'Rent', 'expense', 'operating_expense', { parent: '6000' }),
  a('6510', 'Utilities', 'expense', 'operating_expense', { parent: '6000' }),
  a('6520', 'Software and subscriptions', 'expense', 'operating_expense', { parent: '6000' }),
  a('6530', 'Marketing', 'expense', 'operating_expense', { parent: '6000' }),
  a('6540', 'Travel', 'expense', 'operating_expense', { parent: '6000' }),
  a('6550', 'Office supplies', 'expense', 'operating_expense', { parent: '6000' }),
  a('6560', 'Professional fees', 'expense', 'operating_expense', { parent: '6000' }),
  a('7000', 'Other expenses', 'expense', 'other_expense', { group: true }),
  a('7200', 'Gain or loss on asset disposal', 'expense', 'other_expense', {
    parent: '7000',
    key: 'disposal_gain_loss',
    description: 'A gain is a credit, a loss a debit.',
  }),
  a('7100', 'Foreign exchange gain or loss', 'expense', 'other_expense', {
    parent: '7000',
    key: 'fx_gain_loss',
  }),
];

export type Industry = 'general' | 'service' | 'retail' | 'medical' | 'saas';
export const INDUSTRIES: readonly Industry[] = ['general', 'service', 'retail', 'medical', 'saas'];

/** Accounts an industry adds on top of the base chart. */
export const INDUSTRY_ADDITIONS: Readonly<Record<Industry, readonly ChartSeed[]>> = {
  general: [],
  service: [
    a('4110', 'Service revenue', 'revenue', 'operating_revenue', { parent: '4000' }),
    a('5200', 'Subcontractor costs', 'expense', 'cost_of_sales', { parent: '5000' }),
  ],
  retail: [
    a('1160', 'Inventory', 'asset', 'current_asset', { parent: '1100' }),
    a('4120', 'Product sales', 'revenue', 'operating_revenue', { parent: '4000' }),
    a('5110', 'Freight in', 'expense', 'cost_of_sales', { parent: '5000' }),
    a('5120', 'Inventory shrinkage', 'expense', 'cost_of_sales', { parent: '5000' }),
  ],
  medical: [
    a('4130', 'Patient service revenue', 'revenue', 'operating_revenue', { parent: '4000' }),
    a('5210', 'Medical supplies', 'expense', 'cost_of_sales', { parent: '5000' }),
    a('6570', 'Malpractice insurance', 'expense', 'operating_expense', { parent: '6000' }),
  ],
  saas: [
    a('2160', 'Deferred revenue', 'liability', 'current_liability', { parent: '2100' }),
    a('4140', 'Subscription revenue', 'revenue', 'operating_revenue', { parent: '4000' }),
    a('5220', 'Hosting costs', 'expense', 'cost_of_sales', { parent: '5000' }),
    a('6580', 'Capitalized software amortization', 'expense', 'operating_expense', {
      parent: '6000',
    }),
  ],
};

export type CountryTemplate = 'generic' | 'us_gaap' | 'ifrs' | 'india';
export const COUNTRY_TEMPLATES: readonly CountryTemplate[] = [
  'generic',
  'us_gaap',
  'ifrs',
  'india',
];

/** A country template renames accounts to the words of that standard (codes stay, so reports stay comparable). */
export const COUNTRY_NAMES: Readonly<Record<CountryTemplate, Readonly<Record<string, string>>>> = {
  generic: {},
  us_gaap: {
    '1130': 'Accounts receivable, net',
    '2120': 'Sales tax payable',
    '3100': 'Members equity',
    '4100': 'Net sales',
  },
  ifrs: {
    '1130': 'Trade receivables',
    '2110': 'Trade payables',
    '2120': 'Current tax liabilities',
    '3100': 'Share capital',
    '4100': 'Revenue from contracts with customers',
  },
  india: {
    '1130': 'Sundry debtors',
    '2110': 'Sundry creditors',
    '2120': 'GST payable',
    '1140': 'GST input credit',
    '3100': 'Capital account',
  },
};

export const MAX_IMPORT_ROWS = 2000;
export const MAX_IMPORT_BYTES = 1_000_000;
export const MAX_JOURNAL_LINES = 200;
export const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024;
/** The largest request body for an attachment sent as base64 text (a third larger than the file). */
export const MAX_ATTACHMENT_BODY_BYTES = 11_500_000;
export const ATTACHMENT_TYPES: readonly string[] = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'text/csv',
];
/** A journal that a staff member posts waits for the owner. */
export const JOURNAL_APPROVAL_ACTION = 'journal.post';

export const REPORT_KEYS = [
  'trial_balance',
  'general_ledger',
  'account_register',
  'profit_loss',
  'profit_loss_trend',
  'balance_sheet',
  'cash_flow',
  'ar_aging',
  'ap_aging',
  'cash_balances',
  'tax_summary',
  'ratios',
  'expense_summary',
  'expense_by_account',
  'expense_trend',
] as const;
export type ReportKey = (typeof REPORT_KEYS)[number];

export interface ReportInfo {
  key: ReportKey;
  title: string;
  description: string;
  /** What the report needs: a period (from and to), a date (as of), or an account. */
  needs: 'period' | 'date' | 'account';
}

export const REPORT_CATALOG: readonly ReportInfo[] = [
  {
    key: 'profit_loss',
    title: 'Profit and loss',
    description:
      'Revenue, costs and the result of a period, with a comparison and drill-down to the journal.',
    needs: 'period',
  },
  {
    key: 'profit_loss_trend',
    title: 'Profit and loss by month',
    description: 'Revenue, expenses and result for each month.',
    needs: 'period',
  },
  {
    key: 'balance_sheet',
    title: 'Balance sheet',
    description:
      'Assets, liabilities and equity on a date, with the check that assets equal liabilities plus equity.',
    needs: 'date',
  },
  {
    key: 'cash_flow',
    title: 'Cash flow statement',
    description:
      'Where the cash came from and went, by operating, investing and financing activities.',
    needs: 'period',
  },
  {
    key: 'trial_balance',
    title: 'Trial balance',
    description: 'Every account with its debit or credit balance on a date.',
    needs: 'date',
  },
  {
    key: 'general_ledger',
    title: 'General ledger',
    description: 'Every posted line of every account in a period, with running balances.',
    needs: 'period',
  },
  {
    key: 'account_register',
    title: 'Account register',
    description: 'One account with the running balance after each line.',
    needs: 'account',
  },
  {
    key: 'ar_aging',
    title: 'Receivables aging',
    description: 'Unpaid invoices by days past due.',
    needs: 'date',
  },
  {
    key: 'ap_aging',
    title: 'Payables aging',
    description: 'Unpaid supplier bills by days past due.',
    needs: 'date',
  },
  {
    key: 'cash_balances',
    title: 'Cash balances',
    description: 'The balance of every cash and bank account.',
    needs: 'date',
  },
  {
    key: 'tax_summary',
    title: 'Tax summary',
    description: 'Tax collected on sales against tax paid on purchases, and the net payable.',
    needs: 'period',
  },
  {
    key: 'ratios',
    title: 'Financial ratios',
    description: 'Current ratio, quick ratio, debt to equity, margins and return on equity.',
    needs: 'period',
  },
  {
    key: 'expense_summary',
    title: 'Expense summary',
    description: 'All expenses of a period, biggest first, with their share.',
    needs: 'period',
  },
  {
    key: 'expense_by_account',
    title: 'Expenses by category',
    description: 'Expenses grouped by account.',
    needs: 'period',
  },
  {
    key: 'expense_trend',
    title: 'Expense trend',
    description: 'Each expense account by month.',
    needs: 'period',
  },
];
