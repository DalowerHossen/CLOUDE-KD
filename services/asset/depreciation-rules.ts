// path: services/asset/depreciation-rules.ts
// Depreciation as pure functions: the monthly amount for straight line, declining balance, sum of the digits and units of
// production, the schedule over the whole life, the entries for buying, depreciating and disposing of an asset, the CSV import
// of assets and the input shapes. The last month always depreciates what is left down to the salvage value. No database here.
import { z } from 'zod';
import { partialPatch } from '@/lib/security/zod-strict';
import { toInt } from '@/lib/reports/numbers';
import { Money } from '@/lib/utils/currency';
import { columnOf, csvTable } from '@/services/accounting/accounting-csv';
import { dayText } from '@/services/accounting/journal-rules';
import { addMonthsToDay } from '@/services/accounting/period-rules';

export const METHODS = [
  'straight_line',
  'declining_balance',
  'units_of_production',
  'sum_of_years',
] as const;
export type Method = (typeof METHODS)[number];

const plain = (min: number, max: number): z.ZodString =>
  z
    .string()
    .trim()
    .min(min)
    .max(max)
    .refine((v) => !/[<>]/.test(v), { message: 'Angle brackets are not allowed.' });
const amount = z.string().regex(/^\d{1,14}(\.\d{1,4})?$/, 'Enter an amount like 1000 or 1000.50.');

export const assetInput = z
  .object({
    name: plain(1, 120),
    categoryId: z.string().uuid(),
    purchaseDate: dayText,
    inServiceDate: dayText.nullable().default(null),
    cost: amount,
    salvageValue: amount.default('0'),
    lifeMonths: z.number().int().min(1).max(1200),
    method: z.enum(METHODS),
    decliningFactor: z
      .string()
      .regex(/^[1-4](\.\d{1,4})?$/, 'Use a factor from 1 to 4.')
      .default('2'),
    totalUnits: amount.nullable().default(null),
    location: plain(0, 120).default(''),
    serialNumber: plain(0, 80).default(''),
    vendor: plain(0, 120).default(''),
    warrantyUntil: dayText.nullable().default(null),
    warrantyNote: plain(0, 300).default(''),
    /** `none`: already on the books (nothing is posted); otherwise the purchase is booked against the bank or payables. */
    fundedFrom: z.enum(['none', 'bank', 'payable']).default('none'),
  })
  .strict()
  .superRefine((v, ctx) => {
    const cost = safe(v.cost);
    if (!cost.isPositive())
      ctx.addIssue({ code: 'custom', path: ['cost'], message: 'The cost must be above zero.' });
    if (safe(v.salvageValue).gt(cost))
      ctx.addIssue({
        code: 'custom',
        path: ['salvageValue'],
        message: 'The salvage value cannot be above the cost.',
      });
    if (
      v.method === 'units_of_production' &&
      (v.totalUnits === null || !safe(v.totalUnits).isPositive())
    )
      ctx.addIssue({
        code: 'custom',
        path: ['totalUnits'],
        message: 'Units of production needs the total units.',
      });
    if (v.inServiceDate !== null && v.inServiceDate < v.purchaseDate)
      ctx.addIssue({
        code: 'custom',
        path: ['inServiceDate'],
        message: 'The asset cannot be in service before it is bought.',
      });
  });
export type AssetInput = z.infer<typeof assetInput>;

export const assetUpdate = z
  .object({
    version: z.number().int().min(1),
    name: plain(1, 120).optional(),
    location: plain(0, 120).optional(),
    serialNumber: plain(0, 80).optional(),
    vendor: plain(0, 120).optional(),
    warrantyUntil: dayText.nullable().optional(),
    warrantyNote: plain(0, 300).optional(),
  })
  .strict();

export const categoryInput = z
  .object({
    name: plain(1, 80),
    method: z.enum(METHODS).default('straight_line'),
    lifeMonths: z.number().int().min(1).max(1200).default(60),
    assetAccountId: z.string().uuid().nullable().default(null),
    accumulatedAccountId: z.string().uuid().nullable().default(null),
    expenseAccountId: z.string().uuid().nullable().default(null),
  })
  .strict();

export const categoryUpdate = partialPatch(categoryInput)
  .extend({ version: z.number().int().min(1), status: z.enum(['active', 'inactive']).optional() })
  .strict();

export const disposeInput = z
  .object({
    disposedOn: dayText,
    proceeds: amount.default('0'),
    note: plain(0, 300).default(''),
  })
  .strict();

export const usageInput = z.object({ month: dayText, units: amount }).strict();
export const runInput = z.object({ throughMonth: dayText }).strict();

function safe(text: string): Money {
  try {
    return Money.parse(text);
  } catch {
    return Money.zero();
  }
}

export interface AssetTerms {
  cost: string;
  salvage: string;
  lifeMonths: number;
  method: Method;
  factor: string;
  totalUnits: string | null;
  inService: string;
}

export interface DepState {
  /** Depreciation booked so far. */
  accumulated: string;
  /** Months already depreciated (the next month is monthsDone + 1). */
  monthsDone: number;
  /** Units used in the month (units of production only). */
  units?: string;
}

/** Depreciation for the next month, never below zero and never past the salvage value; the last month takes what is left. */
export function monthAmount(t: AssetTerms, s: DepState): Money {
  const cost = Money.parse(t.cost);
  const base = cost.sub(t.salvage);
  const done = Money.parse(s.accumulated);
  const remaining = Money.max(base.sub(done), Money.zero());
  if (remaining.isZero()) return Money.zero();
  const k = s.monthsDone + 1;
  const life = t.lifeMonths;
  let raw: Money;
  switch (t.method) {
    case 'straight_line':
      raw = base.div(String(life));
      break;
    case 'declining_balance':
      raw = cost.sub(done).mul(t.factor).div(String(life));
      break;
    case 'sum_of_years':
      raw = base.mul(String(life - k + 1)).div(String((life * (life + 1)) / 2));
      break;
    case 'units_of_production': {
      const units = Money.parse(s.units ?? '0');
      if (!t.totalUnits || units.isZero()) return Money.zero();
      return Money.min(base.mul(units.toDbString()).div(t.totalUnits), remaining);
    }
  }
  if (k >= life) return remaining;
  return Money.min(raw, remaining);
}

/** The first day of the month of a date. */
export const monthStart = (day: string): string => `${day.slice(0, 7)}-01`;

/** The last day of the month that starts on `month` (a first-of-month date). */
export function monthEnd(month: string): string {
  return new Date(Date.parse(`${addMonthsToDay(month, 1)}T00:00:00Z`) - 86_400_000)
    .toISOString()
    .slice(0, 10);
}

export interface ScheduleRow {
  number: number;
  month: string;
  amount: string;
  accumulated: string;
  netBookValue: string;
}

/** The whole life of an asset month by month (not for units of production, whose amounts depend on use). */
export function schedule(t: AssetTerms): ScheduleRow[] {
  if (t.method === 'units_of_production') return [];
  const rows: ScheduleRow[] = [];
  let acc = Money.zero();
  for (let k = 1; k <= t.lifeMonths; k += 1) {
    const amount = monthAmount(t, { accumulated: acc.toDbString(), monthsDone: k - 1 });
    acc = acc.add(amount);
    rows.push({
      number: k,
      month: addMonthsToDay(monthStart(t.inService), k - 1),
      amount: amount.toDbString(),
      accumulated: acc.toDbString(),
      netBookValue: Money.parse(t.cost).sub(acc).toDbString(),
    });
  }
  return rows;
}

export interface Line {
  key:
    | 'fixed_assets'
    | 'accumulated_depreciation'
    | 'depreciation_expense'
    | 'bank'
    | 'accounts_payable'
    | 'disposal_gain_loss';
  /** An account of the asset's category instead of the company's default for the key. */
  accountId?: string;
  side: 'debit' | 'credit';
  amount: Money;
  description: string;
}

const line = (
  key: Line['key'],
  side: Line['side'],
  amount: Money,
  description: string,
  accountId?: string,
): Line => ({ key, side, amount, description, ...(accountId ? { accountId } : {}) });
const positive = (lines: Line[]): Line[] => lines.filter((l) => l.amount.isPositive());

/** Buying an asset: the asset account is debited, the bank (paid) or payables (owed) credited. */
export function purchaseLines(
  cost: Money,
  funded: 'bank' | 'payable',
  name: string,
  assetAccountId?: string,
): Line[] {
  return [
    line('fixed_assets', 'debit', cost, `Purchase of ${name}`, assetAccountId),
    line(funded === 'bank' ? 'bank' : 'accounts_payable', 'credit', cost, `Purchase of ${name}`),
  ];
}

export interface CategoryAmount {
  expenseAccountId?: string;
  accumulatedAccountId?: string;
  amount: Money;
}

/** One entry for a month of depreciation: expense debited and accumulated depreciation credited, grouped by category accounts. */
export function depreciationLines(items: readonly CategoryAmount[]): Line[] {
  const groups = new Map<string, CategoryAmount>();
  for (const i of items) {
    const key = `${i.expenseAccountId ?? ''}|${i.accumulatedAccountId ?? ''}`;
    const cur = groups.get(key);
    groups.set(key, cur ? { ...cur, amount: cur.amount.add(i.amount) } : { ...i });
  }
  const out: Line[] = [];
  for (const g of groups.values()) {
    out.push(
      line('depreciation_expense', 'debit', g.amount, 'Depreciation', g.expenseAccountId),
      line('accumulated_depreciation', 'credit', g.amount, 'Depreciation', g.accumulatedAccountId),
    );
  }
  return positive(out);
}

export interface Disposal {
  netBookValue: Money;
  gainLoss: Money;
  lines: Line[];
}

/**
 * Selling or scrapping an asset: proceeds in, accumulated depreciation cleared, the cost removed, and the difference between
 * the proceeds and the net book value as a gain (credit) or a loss (debit).
 */
export function disposalLines(
  cost: Money,
  accumulated: Money,
  proceeds: Money,
  name: string,
  accounts: { asset?: string; accumulated?: string } = {},
): Disposal {
  const nbv = cost.sub(accumulated);
  const gainLoss = proceeds.sub(nbv);
  const d = `Disposal of ${name}`;
  const lines = positive([
    line('bank', 'debit', proceeds, d),
    line('accumulated_depreciation', 'debit', accumulated, d, accounts.accumulated),
    line(
      'disposal_gain_loss',
      'debit',
      gainLoss.isNegative() ? gainLoss.abs() : Money.zero(),
      `Loss on ${d.toLowerCase()}`,
    ),
    line('fixed_assets', 'credit', cost, d, accounts.asset),
    line(
      'disposal_gain_loss',
      'credit',
      gainLoss.isPositive() ? gainLoss : Money.zero(),
      `Gain on ${d.toLowerCase()}`,
    ),
  ]);
  return { netBookValue: nbv, gainLoss, lines };
}

export interface ImportedAsset {
  line: number;
  category: string;
  input: Omit<AssetInput, 'categoryId'>;
}

export interface AssetImport {
  assets: ImportedAsset[];
  errors: { line: number; message: string }[];
}

/** The file names categories, not ids; the row is checked against a stand-in id and the real one is resolved on import. */
const PLACEHOLDER_CATEGORY = '00000000-0000-4000-8000-000000000000';
const NAME = ['name', 'asset', 'asset name'];
const CATEGORY = ['category', 'asset category'];
const PURCHASE = ['purchase date', 'date', 'bought'];
const SERVICE = ['in service date', 'service date'];
const COST = ['cost', 'purchase cost', 'price'];
const SALVAGE = ['salvage', 'salvage value', 'residual value'];
const LIFE = ['life months', 'life (months)', 'useful life months'];
const METHOD = ['method', 'depreciation method'];
const SERIAL = ['serial', 'serial number'];
const LOCATION = ['location', 'branch'];
const UNITS = ['total units', 'units'];

/** Reads an assets file. Imported assets are already on the books (nothing is posted); every bad row is listed with its line. */
export function parseAssetsCsv(text: string): AssetImport {
  const table = csvTable(text);
  const errors: AssetImport['errors'] = [];
  const assets: ImportedAsset[] = [];
  const i = {
    name: columnOf(table.header, NAME),
    category: columnOf(table.header, CATEGORY),
    purchase: columnOf(table.header, PURCHASE),
    service: columnOf(table.header, SERVICE),
    cost: columnOf(table.header, COST),
    salvage: columnOf(table.header, SALVAGE),
    life: columnOf(table.header, LIFE),
    method: columnOf(table.header, METHOD),
    serial: columnOf(table.header, SERIAL),
    location: columnOf(table.header, LOCATION),
    units: columnOf(table.header, UNITS),
  };
  if (i.name < 0 || i.category < 0 || i.purchase < 0 || i.cost < 0 || i.life < 0) {
    return {
      assets,
      errors: [
        {
          line: 1,
          message:
            'The file needs the columns: name, category, purchase date, cost and life months.',
        },
      ],
    };
  }
  if (table.rows.length > 2000)
    return { assets, errors: [{ line: 1, message: 'A file can have 2000 rows at most.' }] };
  table.rows.forEach((row, index) => {
    const line = index + 2;
    const cell = (c: number): string => (c >= 0 ? (row[c] ?? '').trim() : '');
    const method = (cell(i.method)
      .toLowerCase()
      .replace(/[\s-]+/g, '_') || 'straight_line') as Method;
    const parsed = assetInput.safeParse({
      name: cell(i.name),
      categoryId: PLACEHOLDER_CATEGORY,
      purchaseDate: cell(i.purchase),
      inServiceDate: cell(i.service) === '' ? null : cell(i.service),
      cost: cell(i.cost),
      salvageValue: cell(i.salvage) === '' ? '0' : cell(i.salvage),
      lifeMonths: toInt(cell(i.life), 0),
      method,
      totalUnits: cell(i.units) === '' ? null : cell(i.units),
      location: cell(i.location),
      serialNumber: cell(i.serial),
      fundedFrom: 'none',
    });
    if (!parsed.success)
      return void errors.push({
        line,
        message: parsed.error.issues[0]?.message ?? 'The row is not valid.',
      });
    if (cell(i.category) === '')
      return void errors.push({ line, message: 'The category is empty.' });
    const { categoryId: _unused, ...input } = parsed.data;
    assets.push({ line, category: cell(i.category), input });
  });
  return { assets, errors };
}
