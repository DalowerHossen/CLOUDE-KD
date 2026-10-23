// path: services/reconciliation/statement-parsers.ts
// Reading a bank statement: CSV files (columns found by name, one amount column or a debit and a credit column, dates in the
// format the owner picks), OFX and QFX files (the STMTTRN blocks). Every line is checked; a bad line is listed with its line
// number and the good lines are kept. Amounts are signed: a deposit is positive, a payment is negative. Pure, no database.
import { createHash } from 'node:crypto';
import { columnOf, csvTable } from '@/services/accounting/accounting-csv';
import { toInt } from '@/lib/reports/numbers';
import { Money } from '@/lib/utils/currency';

export type DateFormat = 'iso' | 'mdy' | 'dmy';
export type StatementFormat = 'csv' | 'ofx' | 'qfx';

export interface ParsedTxn {
  date: string;
  description: string;
  reference: string;
  externalId: string | null;
  amount: string;
  balance: string | null;
}

export interface ParsedStatement {
  format: StatementFormat;
  transactions: ParsedTxn[];
  endingBalance: string | null;
  errors: { line: number; message: string }[];
}

export const MAX_STATEMENT_ROWS = 5000;
export const MAX_STATEMENT_BYTES = 2_000_000;

const pad = (n: number): string => String(n).padStart(2, '0');

function realDay(y: number, m: number, d: number): string | null {
  if (y < 1990 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const iso = `${String(y).padStart(4, '0')}-${pad(m)}-${pad(d)}`;
  return new Date(`${iso}T00:00:00Z`).toISOString().slice(0, 10) === iso ? iso : null;
}

/** A date in the chosen format (separators - / . are accepted; a 2-digit year means 20xx). Null when it does not exist. */
export function parseDay(text: string, format: DateFormat): string | null {
  const t = text.trim().slice(0, 10).replace(/[./]/g, '-');
  const parts = t.split('-');
  if (parts.length !== 3 || parts.some((p) => !/^\d{1,4}$/.test(p))) return null;
  const [a, b, c] = parts.map((p) => toInt(p)) as [number, number, number];
  const year = (y: number, raw: string | undefined): number =>
    raw !== undefined && raw.length <= 2 ? 2000 + y : y;
  if (format === 'iso') return realDay(a, b, c);
  if (format === 'mdy') return realDay(year(c, parts[2]), a, b);
  return realDay(year(c, parts[2]), b, a);
}

/** An amount like 1,234.56, (12.00), -12, $12 or 12.00-. Null when it is not a number or has more than four decimals. */
export function parseAmount(text: string): Money | null {
  let t = text.trim();
  if (t === '') return null;
  let negative = false;
  if (/^\(.*\)$/.test(t)) {
    negative = true;
    t = t.slice(1, -1);
  }
  if (t.endsWith('-')) {
    negative = !negative;
    t = t.slice(0, -1);
  }
  t = t.replace(/[$\s]/g, '').replace(/,/g, '');
  if (t.startsWith('-')) {
    negative = !negative;
    t = t.slice(1);
  } else if (t.startsWith('+')) t = t.slice(1);
  if (!/^\d{1,14}(\.\d{1,4})?$/.test(t)) return null;
  const value = Money.parse(t);
  return negative ? value.negate() : value;
}

const DATE_NAMES = [
  'date',
  'posting date',
  'transaction date',
  'posted date',
  'booking date',
  'value date',
];
const DESC_NAMES = [
  'description',
  'details',
  'memo',
  'payee',
  'narrative',
  'name',
  'transaction description',
];
const REF_NAMES = [
  'reference',
  'ref',
  'check number',
  'cheque no',
  'transaction id',
  'reference number',
];
const AMOUNT_NAMES = ['amount', 'amt', 'transaction amount'];
const DEBIT_NAMES = ['debit', 'withdrawal', 'withdrawals', 'money out', 'paid out', 'debits'];
const CREDIT_NAMES = ['credit', 'deposit', 'deposits', 'money in', 'paid in', 'credits'];
const BALANCE_NAMES = ['balance', 'running balance', 'ledger balance'];

const clean = (v: string, max: number): string =>
  v.replace(/[<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

export function parseBankCsv(text: string, dateFormat: DateFormat): ParsedStatement {
  const table = csvTable(text);
  const errors: ParsedStatement['errors'] = [];
  const out: ParsedStatement = { format: 'csv', transactions: [], endingBalance: null, errors };
  const iDate = columnOf(table.header, DATE_NAMES);
  const iDesc = columnOf(table.header, DESC_NAMES);
  const iRef = columnOf(table.header, REF_NAMES);
  const iAmount = columnOf(table.header, AMOUNT_NAMES);
  const iDebit = columnOf(table.header, DEBIT_NAMES);
  const iCredit = columnOf(table.header, CREDIT_NAMES);
  const iBalance = columnOf(table.header, BALANCE_NAMES);
  if (iDate < 0 || (iAmount < 0 && iDebit < 0 && iCredit < 0)) {
    errors.push({
      line: 1,
      message: 'The file needs a date column and an amount column (or debit and credit columns).',
    });
    return out;
  }
  if (table.rows.length > MAX_STATEMENT_ROWS) {
    errors.push({ line: 1, message: `A file can have ${MAX_STATEMENT_ROWS} rows at most.` });
    return out;
  }
  table.rows.forEach((row, index) => {
    const line = index + 2;
    const cell = (i: number): string => (i >= 0 ? (row[i] ?? '').trim() : '');
    const date = parseDay(cell(iDate), dateFormat);
    if (!date)
      return void errors.push({
        line,
        message: `The date "${cell(iDate).slice(0, 20)}" does not fit the chosen date format.`,
      });
    let amount: Money | null = null;
    if (iAmount >= 0 && cell(iAmount) !== '') amount = parseAmount(cell(iAmount));
    else {
      const debit = cell(iDebit) === '' ? Money.zero() : parseAmount(cell(iDebit));
      const credit = cell(iCredit) === '' ? Money.zero() : parseAmount(cell(iCredit));
      if (debit && credit) amount = credit.abs().sub(debit.abs());
    }
    if (!amount) return void errors.push({ line, message: 'The amount is not a number.' });
    if (amount.isZero()) return void errors.push({ line, message: 'A line of zero is skipped.' });
    const balance = cell(iBalance) === '' ? null : parseAmount(cell(iBalance));
    out.transactions.push({
      date,
      description: clean(cell(iDesc), 500),
      reference: clean(cell(iRef), 120),
      externalId: null,
      amount: amount.toDbString(),
      balance: balance ? balance.toDbString() : null,
    });
  });
  const last = out.transactions.at(-1);
  out.endingBalance = last?.balance ?? null;
  return out;
}

/** The text of the first tag with this name after `from`, or null. SGML-style OFX has no closing tags. */
function tag(block: string, name: string): string | null {
  const m = new RegExp(`<${name}>([^<\\r\\n]*)`, 'i').exec(block);
  return m ? (m[1] ?? '').trim() : null;
}

function ofxDay(text: string | null): string | null {
  if (!text || !/^\d{8}/.test(text)) return null;
  return realDay(toInt(text.slice(0, 4)), toInt(text.slice(4, 6)), toInt(text.slice(6, 8)));
}

export function parseOfx(text: string, format: 'ofx' | 'qfx'): ParsedStatement {
  const errors: ParsedStatement['errors'] = [];
  const out: ParsedStatement = { format, transactions: [], endingBalance: null, errors };
  const currency = tag(text, 'CURDEF');
  if (currency && currency.toUpperCase() !== 'USD') {
    errors.push({
      line: 1,
      message: `The statement is in ${currency.slice(0, 3).toUpperCase()}; only USD is supported.`,
    });
    return out;
  }
  const blocks = text.split(/<STMTTRN>/i).slice(1);
  if (blocks.length === 0) {
    errors.push({ line: 1, message: 'No transactions were found in the file.' });
    return out;
  }
  if (blocks.length > MAX_STATEMENT_ROWS) {
    errors.push({
      line: 1,
      message: `A file can have ${MAX_STATEMENT_ROWS} transactions at most.`,
    });
    return out;
  }
  blocks.forEach((raw, index) => {
    const block = raw.split(/<\/STMTTRN>/i)[0] ?? raw;
    const line = index + 1;
    const date = ofxDay(tag(block, 'DTPOSTED'));
    if (!date) return void errors.push({ line, message: 'Transaction has no valid posting date.' });
    const amount = parseAmount((tag(block, 'TRNAMT') ?? '').replace(',', '.'));
    if (!amount) return void errors.push({ line, message: 'Transaction amount is not a number.' });
    if (amount.isZero()) return void errors.push({ line, message: 'A line of zero is skipped.' });
    const name = tag(block, 'NAME') ?? '';
    const memo = tag(block, 'MEMO') ?? '';
    out.transactions.push({
      date,
      description: clean(name && memo && name !== memo ? `${name} ${memo}` : name || memo, 500),
      reference: clean(tag(block, 'CHECKNUM') ?? tag(block, 'REFNUM') ?? '', 120),
      externalId: clean(tag(block, 'FITID') ?? '', 120) || null,
      amount: amount.toDbString(),
      balance: null,
    });
  });
  const ledger = /<LEDGERBAL>[\s\S]*?<BALAMT>([^<\r\n]*)/i.exec(text);
  const bal = ledger ? parseAmount(ledger[1] ?? '') : null;
  out.endingBalance = bal ? bal.toDbString() : null;
  return out;
}

export function detectFormat(fileName: string, text: string): StatementFormat {
  const name = fileName.toLowerCase();
  if (name.endsWith('.qfx')) return 'qfx';
  if (name.endsWith('.ofx') || /<OFX>|OFXHEADER/i.test(text.slice(0, 2000))) return 'ofx';
  return 'csv';
}

export function parseStatement(
  fileName: string,
  text: string,
  dateFormat: DateFormat,
): ParsedStatement {
  const format = detectFormat(fileName, text);
  return format === 'csv' ? parseBankCsv(text, dateFormat) : parseOfx(text, format);
}

/**
 * A key that is the same for the same bank line in two files, even when the files overlap. Two identical lines in one file get
 * a different key by their position among the identical ones (`ordinal`).
 */
export function dedupeKey(bankAccountId: string, t: ParsedTxn, ordinal: number): string {
  const base = t.externalId
    ? `${bankAccountId}|id|${t.externalId}`
    : `${bankAccountId}|${t.date}|${t.amount}|${t.description.toLowerCase()}|${t.reference}|${ordinal}`;
  return createHash('sha256').update(base).digest('hex');
}

/** Keys for the lines of one file, in order. */
export function dedupeKeys(bankAccountId: string, list: readonly ParsedTxn[]): string[] {
  const seen = new Map<string, number>();
  return list.map((t) => {
    const probe = `${t.date}|${t.amount}|${t.description.toLowerCase()}|${t.reference}`;
    const n = (seen.get(probe) ?? 0) + 1;
    seen.set(probe, n);
    return dedupeKey(bankAccountId, t, n);
  });
}

export function fileHash(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}
