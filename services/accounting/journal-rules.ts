// path: services/accounting/journal-rules.ts
// The rules of a journal entry as pure functions: the input shapes, the balance check, the reversing lines, who needs an
// approval to post, and reading a journal CSV file. Debit equals credit is also enforced by the database.
import { z } from 'zod';
import { MAX_IMPORT_ROWS, MAX_JOURNAL_LINES } from '@/config/s15-accounting';
import { Money } from '@/lib/utils/currency';
import { columnOf, csvTable } from './accounting-csv';

const plain = (min: number, max: number): z.ZodEffects<z.ZodString, string, string> =>
  z
    .string()
    .trim()
    .min(min)
    .max(max)
    .refine((v) => !/[<>]/.test(v), { message: 'Angle brackets are not allowed.' });

const amount = z.string().regex(/^\d{1,14}(\.\d{1,4})?$/, 'Enter an amount like 100 or 100.50.');

/** A calendar date as text (2026-10-31) that exists. */
export const dayText = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date like 2026-10-31.')
  .refine((v) => new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v, {
    message: 'The date does not exist.',
  });

/** True for a valid amount above zero; false for zero or for text that is not an amount (the field check reports that). */
function amountOf(text: string): Money {
  try {
    return Money.parse(text);
  } catch {
    return Money.zero();
  }
}

function isPositive(text: string): boolean {
  return amountOf(text).isPositive();
}

export const journalLineInput = z
  .object({
    accountId: z.string().uuid(),
    debit: amount.default('0'),
    credit: amount.default('0'),
    description: plain(0, 300).default(''),
  })
  .strict()
  .refine((l) => isPositive(l.debit) !== isPositive(l.credit), {
    message: 'A line has a debit or a credit, not both and not neither.',
  });
export type JournalLineInput = z.infer<typeof journalLineInput>;

export interface Totals {
  debit: Money;
  credit: Money;
  balanced: boolean;
}

export function totals(lines: readonly Pick<JournalLineInput, 'debit' | 'credit'>[]): Totals {
  const debit = Money.sum(lines.map((l) => amountOf(l.debit)));
  const credit = Money.sum(lines.map((l) => amountOf(l.credit)));
  return { debit, credit, balanced: debit.eq(credit) && debit.isPositive() };
}

export const journalInput = z
  .object({
    entryDate: dayText,
    memo: plain(0, 500).default(''),
    note: plain(0, 2000).default(''),
    lines: z.array(journalLineInput).min(2).max(MAX_JOURNAL_LINES),
  })
  .strict()
  .superRefine((v, ctx) => {
    const t = totals(v.lines);
    if (!t.balanced)
      ctx.addIssue({
        code: 'custom',
        path: ['lines'],
        message: `Debits ${t.debit.toDbString()} and credits ${t.credit.toDbString()} must be equal and above zero.`,
      });
  });
export type JournalInput = z.infer<typeof journalInput>;

/** A draft may be saved unbalanced while it is being typed. */
export const journalDraftInput = z
  .object({
    entryDate: dayText,
    memo: plain(0, 500).default(''),
    note: plain(0, 2000).default(''),
    lines: z.array(journalLineInput).min(2).max(MAX_JOURNAL_LINES),
  })
  .strict();

export const templateInput = z
  .object({
    name: plain(1, 100),
    memo: plain(0, 500).default(''),
    lines: z.array(journalLineInput).min(2).max(MAX_JOURNAL_LINES),
  })
  .strict();

/** Debit and credit swapped, for a reversing entry. */
export function reverseLines(lines: readonly JournalLineInput[]): JournalLineInput[] {
  return lines.map((l) => ({ ...l, debit: l.credit, credit: l.debit }));
}

/** The lines as the database function reads them. */
export function linesJson(lines: readonly JournalLineInput[]): Record<string, string>[] {
  return lines.map((l) => ({
    account_id: l.accountId,
    debit: Money.parse(l.debit).toDbString(),
    credit: Money.parse(l.credit).toDbString(),
    description: l.description,
  }));
}

/** An owner posts at once; a staff member's entry waits for the owner. */
export function postRoute(role: string): 'post' | 'approval' {
  return role === 'staff' ? 'approval' : 'post';
}

export interface ImportedEntry {
  reference: string;
  input: JournalInput;
  firstLine: number;
}

export interface JournalImport {
  entries: ImportedEntry[];
  errors: { line: number; message: string }[];
}

const REF_NAMES = ['entry', 'reference', 'entry number', 'journal', 'ref'];
const DATE_NAMES = ['date', 'entry date'];
const MEMO_NAMES = ['memo', 'entry memo'];
const ACCOUNT_NAMES = ['account', 'account number', 'account code', 'code'];
const DEBIT_NAMES = ['debit'];
const CREDIT_NAMES = ['credit'];
const DESC_NAMES = ['description', 'line description'];

/**
 * Reads a journal file: one row per line, rows with the same entry reference belong to one entry. The account is the
 * account number. Entries are checked one by one; a bad entry is listed and the others are kept.
 */
export function parseJournalCsv(
  text: string,
  accountIdByCode: ReadonlyMap<string, string>,
): JournalImport {
  const table = csvTable(text);
  const errors: JournalImport['errors'] = [];
  const iRef = columnOf(table.header, REF_NAMES);
  const iDate = columnOf(table.header, DATE_NAMES);
  const iAccount = columnOf(table.header, ACCOUNT_NAMES);
  const iDebit = columnOf(table.header, DEBIT_NAMES);
  const iCredit = columnOf(table.header, CREDIT_NAMES);
  if (iRef < 0 || iDate < 0 || iAccount < 0 || iDebit < 0 || iCredit < 0) {
    return {
      entries: [],
      errors: [
        { line: 1, message: 'The file needs the columns: entry, date, account, debit and credit.' },
      ],
    };
  }
  if (table.rows.length > MAX_IMPORT_ROWS) {
    return {
      entries: [],
      errors: [{ line: 1, message: `A file can have ${MAX_IMPORT_ROWS} rows at most.` }],
    };
  }
  const iMemo = columnOf(table.header, MEMO_NAMES);
  const iDesc = columnOf(table.header, DESC_NAMES);
  const groups = new Map<
    string,
    { date: string; memo: string; first: number; lines: unknown[]; bad: boolean }
  >();
  table.rows.forEach((row, index) => {
    const line = index + 2;
    const cell = (i: number): string => (i >= 0 ? (row[i] ?? '').trim() : '');
    const ref = cell(iRef);
    const accountId = accountIdByCode.get(cell(iAccount));
    if (ref === '' || ref.length > 60)
      return void errors.push({ line, message: 'The entry reference is empty or too long.' });
    const group = groups.get(ref) ?? {
      date: cell(iDate),
      memo: cell(iMemo),
      first: line,
      lines: [],
      bad: false,
    };
    groups.set(ref, group);
    if (!accountId) {
      group.bad = true;
      return void errors.push({ line, message: `The account ${cell(iAccount)} does not exist.` });
    }
    if (cell(iDate) !== group.date) {
      group.bad = true;
      return void errors.push({ line, message: 'All lines of one entry need the same date.' });
    }
    group.lines.push({
      accountId,
      debit: cell(iDebit) || '0',
      credit: cell(iCredit) || '0',
      description: cell(iDesc),
    });
  });
  const entries: ImportedEntry[] = [];
  for (const [reference, g] of groups) {
    if (g.bad) continue;
    const parsed = journalDraftInput.safeParse({ entryDate: g.date, memo: g.memo, lines: g.lines });
    if (!parsed.success) {
      errors.push({
        line: g.first,
        message: `Entry ${reference}: ${parsed.error.issues[0]?.message ?? 'not valid'}`,
      });
      continue;
    }
    const t = totals(parsed.data.lines);
    if (!t.balanced) {
      errors.push({
        line: g.first,
        message: `Entry ${reference}: debits ${t.debit.toDbString()} and credits ${t.credit.toDbString()} are not equal.`,
      });
      continue;
    }
    entries.push({ reference, input: journalInput.parse(parsed.data), firstLine: g.first });
  }
  return { entries, errors };
}
