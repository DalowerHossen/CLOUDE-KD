// path: services/accounting/chart-rules.ts
// The rules of the chart of accounts as pure functions: the input shapes, the starting chart with its industry and country
// choices, the tree, and reading and writing the chart as CSV (QuickBooks and Xero style files are understood).
import { z } from 'zod';
import {
  ACCOUNT_TYPES,
  BASE_CHART,
  COUNTRY_NAMES,
  INDUSTRY_ADDITIONS,
  MAX_IMPORT_ROWS,
  SUBTYPES_BY_TYPE,
  type AccountSubtype,
  type AccountType,
  type ChartSeed,
  type CountryTemplate,
  type Industry,
} from '@/config/s15-accounting';
import { csvTable, columnOf, toCsv } from './accounting-csv';

const plain = (min: number, max: number): z.ZodEffects<z.ZodString, string, string> =>
  z
    .string()
    .trim()
    .min(min)
    .max(max)
    .refine((v) => !/[<>]/.test(v), { message: 'Angle brackets are not allowed.' });

const code = z.string().regex(/^[0-9]{3,10}$/, 'The account number has 3 to 10 digits.');
const subtypeValues = Object.values(SUBTYPES_BY_TYPE).flat() as [
  AccountSubtype,
  ...AccountSubtype[],
];

export const accountInput = z
  .object({
    code,
    name: plain(1, 120),
    description: plain(0, 500).default(''),
    type: z.enum(ACCOUNT_TYPES as unknown as [AccountType, ...AccountType[]]),
    subtype: z.enum(subtypeValues),
    isContra: z.boolean().default(false),
    parentId: z.string().uuid().nullable().default(null),
    allowPosting: z.boolean().default(true),
    isCash: z.boolean().default(false),
  })
  .strict()
  .refine((v) => SUBTYPES_BY_TYPE[v.type].includes(v.subtype), {
    message: 'The subtype does not fit the type.',
    path: ['subtype'],
  });
export type AccountInput = z.infer<typeof accountInput>;

export const accountUpdate = z
  .object({
    version: z.number().int().min(1),
    code: code.optional(),
    name: plain(1, 120).optional(),
    description: plain(0, 500).optional(),
    subtype: z.enum(subtypeValues).optional(),
    parentId: z.string().uuid().nullable().optional(),
    allowPosting: z.boolean().optional(),
    isCash: z.boolean().optional(),
    status: z.enum(['active', 'inactive']).optional(),
  })
  .strict();
export type AccountUpdate = z.infer<typeof accountUpdate>;

export interface AccountLike {
  id: string;
  code: string;
  name: string;
  parentId: string | null;
}

export interface TreeNode<T extends AccountLike> {
  account: T;
  depth: number;
  children: TreeNode<T>[];
}

/** The chart as a tree, children sorted by code. An account whose parent is not in the list is a root. */
export function buildTree<T extends AccountLike>(accounts: readonly T[]): TreeNode<T>[] {
  const nodes = new Map<string, TreeNode<T>>(
    accounts.map((a) => [a.id, { account: a, depth: 0, children: [] }]),
  );
  const roots: TreeNode<T>[] = [];
  for (const node of nodes.values()) {
    const parent = node.account.parentId ? nodes.get(node.account.parentId) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  const sort = (list: TreeNode<T>[], depth: number): void => {
    list.sort((x, y) => x.account.code.localeCompare(y.account.code));
    for (const n of list) {
      n.depth = depth;
      sort(n.children, depth + 1);
    }
  };
  sort(roots, 0);
  return roots;
}

/** The nodes in display order (a parent before its children). */
export function flattenTree<T extends AccountLike>(roots: readonly TreeNode<T>[]): TreeNode<T>[] {
  const out: TreeNode<T>[] = [];
  const walk = (list: readonly TreeNode<T>[]): void => {
    for (const n of list) {
      out.push(n);
      walk(n.children);
    }
  };
  walk(roots);
  return out;
}

/** The starting chart for an industry and a country template. Codes are unique; a parent always comes before its children. */
export function seedChart(industry: Industry, template: CountryTemplate): ChartSeed[] {
  const names = COUNTRY_NAMES[template];
  const all = [...BASE_CHART, ...INDUSTRY_ADDITIONS[industry]]
    .map((s) => ({ ...s, name: names[s.code] ?? s.name }))
    .sort((x, y) => x.code.localeCompare(y.code));
  const seen = new Set<string>();
  for (const s of all) {
    if (seen.has(s.code)) throw new RangeError(`The chart has the number ${s.code} twice.`);
    seen.add(s.code);
  }
  for (const s of all) {
    if (s.parent && !seen.has(s.parent))
      throw new RangeError(`The parent ${s.parent} of ${s.code} is missing.`);
  }
  return all;
}

interface TypeGuess {
  type: AccountType;
  subtype: AccountSubtype;
  contra?: boolean;
}

/** Account type words of QuickBooks and Xero files and our own words, in lower case. */
const TYPE_WORDS: Readonly<Record<string, TypeGuess>> = {
  asset: { type: 'asset', subtype: 'current_asset' },
  bank: { type: 'asset', subtype: 'current_asset' },
  'accounts receivable': { type: 'asset', subtype: 'current_asset' },
  'accounts receivable (a/r)': { type: 'asset', subtype: 'current_asset' },
  'other current assets': { type: 'asset', subtype: 'current_asset' },
  'other current asset': { type: 'asset', subtype: 'current_asset' },
  current: { type: 'asset', subtype: 'current_asset' },
  'current asset': { type: 'asset', subtype: 'current_asset' },
  'fixed assets': { type: 'asset', subtype: 'fixed_asset' },
  'fixed asset': { type: 'asset', subtype: 'fixed_asset' },
  fixed: { type: 'asset', subtype: 'fixed_asset' },
  'other assets': { type: 'asset', subtype: 'other_asset' },
  'non-current asset': { type: 'asset', subtype: 'other_asset' },
  liability: { type: 'liability', subtype: 'current_liability' },
  'accounts payable': { type: 'liability', subtype: 'current_liability' },
  'accounts payable (a/p)': { type: 'liability', subtype: 'current_liability' },
  'credit card': { type: 'liability', subtype: 'current_liability' },
  'other current liabilities': { type: 'liability', subtype: 'current_liability' },
  'current liability': { type: 'liability', subtype: 'current_liability' },
  'long term liabilities': { type: 'liability', subtype: 'long_term_liability' },
  'non-current liability': { type: 'liability', subtype: 'long_term_liability' },
  equity: { type: 'equity', subtype: 'owner_equity' },
  income: { type: 'revenue', subtype: 'operating_revenue' },
  revenue: { type: 'revenue', subtype: 'operating_revenue' },
  sales: { type: 'revenue', subtype: 'operating_revenue' },
  'other income': { type: 'revenue', subtype: 'other_income' },
  'cost of goods sold': { type: 'expense', subtype: 'cost_of_sales' },
  'direct costs': { type: 'expense', subtype: 'cost_of_sales' },
  expenses: { type: 'expense', subtype: 'operating_expense' },
  expense: { type: 'expense', subtype: 'operating_expense' },
  overhead: { type: 'expense', subtype: 'operating_expense' },
  depreciation: { type: 'expense', subtype: 'operating_expense' },
  'other expense': { type: 'expense', subtype: 'other_expense' },
};

export interface ImportedAccount {
  code: string;
  name: string;
  description: string;
  type: AccountType;
  subtype: AccountSubtype;
  line: number;
}

export interface AccountImport {
  accounts: ImportedAccount[];
  errors: { line: number; message: string }[];
}

const CODE_NAMES = ['account number', 'number', 'code', 'account code', 'account no'];
const NAME_NAMES = ['account name', 'name', 'account'];
const TYPE_NAMES = ['type', 'account type'];
const DETAIL_NAMES = ['detail type', 'subtype', 'account subtype', 'class'];
const DESC_NAMES = ['description', 'desc'];

/** Reads a chart file. Every problem is listed with its line number; a good row is kept even when another row is bad. */
export function parseAccountsCsv(text: string): AccountImport {
  const table = csvTable(text);
  const errors: AccountImport['errors'] = [];
  const accounts: ImportedAccount[] = [];
  const iCode = columnOf(table.header, CODE_NAMES);
  const iName = columnOf(table.header, NAME_NAMES);
  const iType = columnOf(table.header, TYPE_NAMES);
  if (iCode < 0 || iName < 0 || iType < 0) {
    return {
      accounts,
      errors: [
        { line: 1, message: 'The file needs the columns: account number, account name and type.' },
      ],
    };
  }
  const iDetail = columnOf(table.header, DETAIL_NAMES);
  const iDesc = columnOf(table.header, DESC_NAMES);
  if (table.rows.length > MAX_IMPORT_ROWS) {
    return {
      accounts,
      errors: [{ line: 1, message: `A file can have ${MAX_IMPORT_ROWS} rows at most.` }],
    };
  }
  const seen = new Set<string>();
  table.rows.forEach((row, index) => {
    const line = index + 2;
    const cell = (i: number): string => (i >= 0 ? (row[i] ?? '').trim() : '');
    const number = cell(iCode);
    const name = cell(iName);
    const guess = TYPE_WORDS[cell(iType).toLowerCase()];
    const detail = cell(iDetail).toLowerCase().replace(/\s+/g, '_');
    if (!/^[0-9]{3,10}$/.test(number))
      return void errors.push({ line, message: 'The account number has 3 to 10 digits.' });
    if (name === '' || name.length > 120 || /[<>]/.test(name))
      return void errors.push({
        line,
        message: 'The account name is empty, too long or has angle brackets.',
      });
    if (!guess)
      return void errors.push({ line, message: `The type "${cell(iType)}" is not known.` });
    if (seen.has(number))
      return void errors.push({
        line,
        message: `The account number ${number} is in the file twice.`,
      });
    seen.add(number);
    const subtype = (SUBTYPES_BY_TYPE[guess.type] as readonly string[]).includes(detail)
      ? (detail as AccountSubtype)
      : guess.subtype;
    const description = cell(iDesc).slice(0, 500);
    if (/[<>]/.test(description))
      return void errors.push({ line, message: 'The description has angle brackets.' });
    accounts.push({ code: number, name, description, type: guess.type, subtype, line });
  });
  return { accounts, errors };
}

export interface ExportableAccount extends AccountLike {
  type: string;
  subtype: string;
  status: string;
  description: string;
  normalSide: string;
}

export const ACCOUNT_CSV_HEADER = [
  'Account number',
  'Account name',
  'Type',
  'Detail type',
  'Status',
  'Normal side',
  'Description',
];

export function accountsToCsv(accounts: readonly ExportableAccount[]): string {
  const sorted = [...accounts].sort((a, b) => a.code.localeCompare(b.code));
  return toCsv(
    ACCOUNT_CSV_HEADER,
    sorted.map((a) => [a.code, a.name, a.type, a.subtype, a.status, a.normalSide, a.description]),
  );
}
