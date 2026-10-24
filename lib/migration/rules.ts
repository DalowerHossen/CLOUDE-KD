// path: lib/migration/rules.ts
// The migration wizard as pure functions: the inputs, the column name presets of the supported tools, the dry run report, the
// batch to work on next, and the rollback window. No database or file access here.
//
// The presets are lists of column names that these tools commonly use in their customer and item exports. They are written from
// general knowledge, not read from the tools' current documentation (those sites could not be reached), so they only make the
// first guess for the mapping; the owner always sees and confirms the mapping before anything is written.
import { z } from 'zod';
import {
  MIGRATION_BATCH,
  MIGRATION_SOURCES,
  MIGRATION_TARGETS,
  REPORT_PROBLEMS_SHOWN,
  ROLLBACK_WINDOW_HOURS,
  type MigrationSource,
  type MigrationTarget,
} from '@/config/s16-migration';
import { floorDiv } from '@/lib/reports/numbers';

export const SOURCE_LABELS: Readonly<Record<MigrationSource, string>> = {
  quickbooks: 'QuickBooks',
  zoho: 'Zoho Books',
  wave: 'Wave',
  freshbooks: 'FreshBooks',
  xero: 'Xero',
  generic: 'Other tool or spreadsheet',
};

type Aliases = Readonly<Record<string, readonly string[]>>;

const CLIENTS: Readonly<Record<MigrationSource, Aliases>> = {
  quickbooks: {
    name: ['Customer', 'Customer Name', 'Display Name'],
    contact_name: ['Full Name', 'Contact'],
    email: ['Main Email', 'Email'],
    phone: ['Main Phone', 'Phone Numbers', 'Phone'],
    billing_line1: ['Bill Address Street', 'Billing Street', 'Billing Address Line 1'],
    billing_city: ['Bill Address City', 'Billing City'],
    billing_region: ['Bill Address State', 'Billing State'],
    billing_postal_code: ['Bill Address Postal Code', 'Bill Address Zip', 'Billing ZIP'],
    billing_country: ['Bill Address Country', 'Billing Country'],
    opening_balance: ['Open Balance', 'Balance'],
    tax_id: ['Tax Resale No', 'Tax ID'],
  },
  zoho: {
    name: ['Display Name', 'Company Name', 'Customer Name'],
    email: ['EmailID', 'Email'],
    phone: ['Phone', 'MobilePhone'],
    billing_line1: ['Billing Address', 'Billing Street'],
    billing_city: ['Billing City'],
    billing_region: ['Billing State'],
    billing_postal_code: ['Billing Code', 'Billing Zip'],
    billing_country: ['Billing Country'],
    tax_id: ['Tax Registration No'],
    payment_terms_days: ['Payment Terms'],
    opening_balance: ['Opening Balance'],
  },
  wave: {
    name: ['Customer Name', 'Name'],
    email: ['Email'],
    phone: ['Phone'],
    billing_line1: ['Address Line 1'],
    billing_city: ['City'],
    billing_region: ['Province/State'],
    billing_postal_code: ['Postal Code/ZIP Code'],
    billing_country: ['Country'],
    tax_id: ['Tax Number'],
  },
  freshbooks: {
    name: ['Organization', 'Company'],
    contact_name: ['First Name'],
    email: ['Email'],
    phone: ['Business Phone', 'Phone'],
    billing_line1: ['Street', 'Address'],
    billing_city: ['City'],
    billing_region: ['Province/State'],
    billing_postal_code: ['Postal/Zip Code'],
    billing_country: ['Country'],
  },
  xero: {
    name: ['*ContactName', 'ContactName'],
    contact_name: ['FirstName'],
    email: ['EmailAddress'],
    phone: ['PhoneNumber'],
    billing_line1: ['POAddressLine1'],
    billing_line2: ['POAddressLine2'],
    billing_city: ['POCity'],
    billing_region: ['PORegion'],
    billing_postal_code: ['POPostalCode'],
    billing_country: ['POCountry'],
    tax_id: ['TaxNumber'],
    website: ['Website'],
  },
  generic: {},
};

const PRODUCTS: Readonly<Record<MigrationSource, Aliases>> = {
  quickbooks: {
    name: ['Product/Service Name', 'Name'],
    description: ['Sales Description', 'Description'],
    sku: ['SKU'],
    unit_price: ['Sales Price/Rate', 'Price'],
    cost_price: ['Purchase Cost', 'Cost'],
    kind: ['Type'],
  },
  zoho: {
    name: ['Item Name'],
    description: ['Description'],
    sku: ['SKU'],
    unit_price: ['Rate'],
    cost_price: ['Purchase Rate'],
    unit: ['Usage unit'],
    kind: ['Product Type'],
  },
  wave: { name: ['Name'], description: ['Description'], unit_price: ['Price'] },
  freshbooks: { name: ['Name'], description: ['Description'], unit_price: ['Rate', 'Unit Cost'] },
  xero: {
    name: ['ItemName', 'Item Name'],
    sku: ['*ItemCode', 'ItemCode'],
    description: ['SalesDescription', 'PurchasesDescription'],
    unit_price: ['SalesUnitPrice'],
    cost_price: ['PurchasesUnitPrice'],
  },
  generic: {},
};

const SUPPLIERS: Aliases = {
  name: ['Vendor', 'Vendor Name', 'Supplier', 'Supplier Name', 'ContactName', '*ContactName'],
  email: ['Main Email', 'EmailAddress', 'EmailID', 'Email'],
  phone: ['Main Phone', 'PhoneNumber', 'Phone'],
  tax_id: ['Tax ID', 'TaxNumber', 'Tax Number'],
  address_line1: ['Street', 'Address', 'POAddressLine1'],
  address_city: ['City', 'POCity'],
  address_postal_code: ['Postal Code', 'POPostalCode', 'Zip'],
};

export function presetFor(source: MigrationSource, target: MigrationTarget): Aliases {
  if (target === 'clients') return CLIENTS[source];
  if (target === 'products') return PRODUCTS[source];
  return source === 'generic' ? {} : SUPPLIERS;
}

const normal = (v: string): string => v.toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * The first guess for the mapping: the columns the tool's preset names, then the generic names of the field list. A column is used
 * for one field only. Fields without a match are left out (the owner chooses them).
 */
export function suggestWithPreset(
  source: MigrationSource,
  target: MigrationTarget,
  headers: readonly string[],
  fields: readonly { key: string; label: string; aliases: readonly string[] }[],
): Record<string, string> {
  const preset = presetFor(source, target);
  const out: Record<string, string> = {};
  const used = new Set<number>();
  const take = (key: string, names: readonly string[]): void => {
    if (out[key] !== undefined) return;
    const wanted = names.map(normal);
    const at = headers.findIndex((h, i) => !used.has(i) && wanted.includes(normal(h)));
    if (at >= 0) {
      used.add(at);
      out[key] = headers[at] ?? '';
    }
  };
  for (const f of fields) take(f.key, preset[f.key] ?? []);
  for (const f of fields) take(f.key, [f.key, f.label, ...f.aliases]);
  return out;
}

/* ---------- inputs ---------- */

const DEFAULT_KEYS = ['billing_country', 'kind', 'tax_category', 'unit', 'status'] as const;

export const uploadInput = z
  .object({
    source: z.enum(MIGRATION_SOURCES),
    target: z.enum(MIGRATION_TARGETS),
    fileName: z
      .string()
      .trim()
      .min(1)
      .max(200)
      .regex(/\.(csv|xlsx)$/i, { message: 'Use a .csv or .xlsx file.' })
      .refine((v) => !/[\\/<>]/.test(v), {
        message: 'The file name has characters that are not allowed.',
      }),
    dataBase64: z
      .string()
      .min(8)
      .max(9_800_000)
      .regex(/^[A-Za-z0-9+/]+={0,2}$/),
  })
  .strict();

export const validateInput = z
  .object({
    mapping: z.record(z.string().max(60), z.string().max(200)),
    duplicateMode: z.enum(['skip', 'create']),
    /** A value for rows that have none in the file (for example the country of every client). */
    defaults: z
      .partialRecord(
        z.enum(DEFAULT_KEYS),
        z
          .string()
          .trim()
          .min(1)
          .max(40)
          .regex(/^[^<>]*$/),
      )
      .default({}),
  })
  .strict();

export const startInput = z.object({ expectedCreate: z.number().int().min(1).max(5000) }).strict();

/* ---------- the dry run report ---------- */

export interface RowCheck {
  /** The row number in the file (the header is row 1). */
  row: number;
  errors: string[] | null;
  /** The key of the record inside the file (for example the e-mail), or null. */
  fileKey: string | null;
  /** True when a record of the company already has the same identity. */
  existsInSystem: boolean;
}

export interface DryRunReport {
  total: number;
  valid: number;
  invalid: number;
  duplicatesInFile: number;
  duplicatesInSystem: number;
  /** How many records the import would create with the chosen duplicate mode. */
  wouldCreate: number;
  wouldSkip: number;
  problems: { row: number; messages: string[] }[];
  warnings: string[];
}

export function buildReport(
  checks: readonly RowCheck[],
  duplicateMode: 'skip' | 'create',
  extra: { unmappedColumns: readonly string[]; blankOptional: Readonly<Record<string, number>> },
): DryRunReport {
  const seen = new Set<string>();
  let invalid = 0;
  let inFile = 0;
  let inSystem = 0;
  let create = 0;
  let skip = 0;
  const problems: DryRunReport['problems'] = [];
  for (const c of checks) {
    if (c.errors !== null) {
      invalid += 1;
      if (problems.length < REPORT_PROBLEMS_SHOWN)
        problems.push({ row: c.row, messages: c.errors });
      continue;
    }
    let duplicate = false;
    if (c.fileKey !== null) {
      if (seen.has(c.fileKey)) {
        inFile += 1;
        duplicate = true;
      } else seen.add(c.fileKey);
    }
    if (c.existsInSystem) {
      inSystem += 1;
      duplicate = true;
    }
    if (duplicate && duplicateMode === 'skip') skip += 1;
    else create += 1;
  }
  const warnings: string[] = [];
  if (extra.unmappedColumns.length > 0)
    warnings.push(
      `${extra.unmappedColumns.length} column(s) of the file are not used: ${extra.unmappedColumns.slice(0, 10).join(', ')}.`,
    );
  for (const [field, n] of Object.entries(extra.blankOptional))
    if (n > 0) warnings.push(`${n} row(s) have no ${field}.`);
  if (inFile > 0) warnings.push(`${inFile} row(s) repeat a record that is earlier in the file.`);
  if (duplicateMode === 'create' && inSystem > 0)
    warnings.push(
      `${inSystem} record(s) exist already and will be made again because duplicates are not skipped.`,
    );
  return {
    total: checks.length,
    valid: checks.length - invalid,
    invalid,
    duplicatesInFile: inFile,
    duplicatesInSystem: inSystem,
    wouldCreate: create,
    wouldSkip: skip,
    problems,
    warnings,
  };
}

/* ---------- batches and rollback ---------- */

/** The rows to work on next: from the number already processed, at most a batch, never past the end. */
export function nextBatch(
  processed: number,
  total: number,
  size = MIGRATION_BATCH,
): { from: number; to: number } {
  const from = processed < 0 ? 0 : processed;
  const end = from + size;
  return { from, to: end > total ? total : end };
}

export const windowEnd = (from: Date): Date =>
  new Date(from.getTime() + ROLLBACK_WINDOW_HOURS * 3_600_000);

/** May a rollback start now? Only inside the window after the job stopped writing. */
export function rollbackOpen(job: { rollbackUntil: string | null }, now: Date): boolean {
  return job.rollbackUntil !== null && Date.parse(job.rollbackUntil) >= now.getTime();
}

/** Hours left in the rollback window (whole hours, rounded down), or 0. */
export function hoursLeft(job: { rollbackUntil: string | null }, now: Date): number {
  if (!rollbackOpen(job, now)) return 0;
  return floorDiv(Date.parse(job.rollbackUntil ?? '') - now.getTime(), 3_600_000);
}
