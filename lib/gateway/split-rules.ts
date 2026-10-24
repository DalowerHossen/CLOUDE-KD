// path: lib/gateway/split-rules.ts
// The settlement ledger as pure functions: the inputs, how one entry is worked out from the terms (commission, fixed fee, hold), the
// balance rule (a mirror of the database function, used to check it), and the statement rows. All amounts are `Money` (USD,
// four decimals, half up); no JavaScript number arithmetic on money.
import { z } from 'zod';
import {
  SETTLEMENT_ENTRY_KINDS,
  SETTLEMENT_MAX_BATCH,
  SETTLEMENT_MAX_HOLD_DAYS,
  type SettlementEntryKind,
} from '@/config/s16-settlement';
import { toCsv } from '@/lib/transfer/csv';
import { Money } from '@/lib/utils/currency';

const plain = (min: number, max: number): z.ZodString =>
  z
    .string()
    .trim()
    .min(min)
    .max(max)
    .refine((v) => !/[<>]/.test(v), { message: 'Angle brackets are not allowed.' });

const MONEY_TEXT = /^\d{1,14}(\.\d{1,4})?$/;
const SIGNED_MONEY_TEXT = /^-?\d{1,14}(\.\d{1,4})?$/;
const PERCENT_TEXT = /^(100(\.0{1,4})?|\d{1,2}(\.\d{1,4})?)$/;

const money = z
  .string()
  .trim()
  .regex(MONEY_TEXT, 'Use an amount like 12.5000 (up to four decimals).');
const percent = z
  .string()
  .trim()
  .regex(PERCENT_TEXT, 'Use a percent from 0 to 100 (up to four decimals).');

/* ---------- inputs ---------- */

/** True for amount text that is zero (checked on the text, so it is safe on input that failed the shape check). */
const isZeroText = (text: string): boolean => /^-?0+(\.0+)?$/.test(text.trim());

export const termsInput = z
  .object({
    subMerchantId: z.string().uuid().nullable().default(null),
    commissionPercent: percent,
    fixedFee: money,
    holdDays: z.number().int().min(0).max(SETTLEMENT_MAX_HOLD_DAYS),
    minPayout: money,
  })
  .strict();

const entryBase = {
  externalRef: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9._:-]{1,100}$/, 'Use letters, digits and . _ : - only (up to 100).'),
  occurredAt: z.string().datetime({ offset: true }),
  note: plain(0, 300).default(''),
};

export const entryInput = z
  .discriminatedUnion('kind', [
    z.object({ kind: z.literal('sale'), amount: money, ...entryBase }).strict(),
    z.object({ kind: z.literal('refund'), amount: money, ...entryBase }).strict(),
    z.object({ kind: z.literal('chargeback'), amount: money, ...entryBase }).strict(),
    z
      .object({
        kind: z.literal('adjustment'),
        amount: z
          .string()
          .trim()
          .regex(SIGNED_MONEY_TEXT, 'Use an amount like -12.5000 or 12.5000.'),
        ...entryBase,
      })
      .strict(),
  ])
  .refine((v) => !isZeroText(v.amount), { message: 'The amount cannot be zero.' });

export const entriesBatch = z
  .object({
    subMerchantId: z.string().uuid(),
    entries: z.array(entryInput).min(1).max(SETTLEMENT_MAX_BATCH),
  })
  .strict();

export const payoutInput = z
  .object({
    subMerchantId: z.string().uuid(),
    amount: money,
    reference: plain(1, 120),
    paidAt: z.string().datetime({ offset: true }),
    idempotencyKey: z.string().regex(/^[A-Za-z0-9_-]{16,128}$/, 'Invalid key.'),
  })
  .strict()
  .refine((v) => !isZeroText(v.amount), { message: 'The amount must be above zero.' });

export const voidInput = z
  .object({ reason: plain(5, 300), version: z.number().int().min(1) })
  .strict();

/* ---------- working out one entry ---------- */

export interface TermsLike {
  id: string | null;
  commissionPercent: string;
  fixedFee: string;
  holdDays: number;
  minPayout: string;
}

/** Terms of a main merchant that has set none: no commission, no fee, no hold. */
export const NO_TERMS: TermsLike = {
  id: null,
  commissionPercent: '0',
  fixedFee: '0',
  holdDays: 0,
  minPayout: '0',
};

export interface WorkedEntry {
  kind: SettlementEntryKind;
  gross: string;
  commission: string;
  fixedFee: string;
  net: string;
  availableAt: string;
  termsId: string | null;
}

const DAY_MS = 86_400_000;

/**
 * One entry from the amount the main merchant gives and the terms in force. A sale: commission is the percent of the gross and the
 * fixed fee is charged; the net can be paid after the hold days. A refund or chargeback: the gross is negative, the same percent of
 * it is returned as commission, no fee is returned, and it counts at once. An adjustment is signed and carries nothing.
 */
export function workOutEntry(
  kind: SettlementEntryKind,
  amount: string,
  terms: TermsLike,
  occurredAt: Date,
): WorkedEntry {
  const given = Money.parse(amount);
  if (kind === 'adjustment') {
    return {
      kind,
      gross: given.toDbString(),
      commission: Money.zero().toDbString(),
      fixedFee: Money.zero().toDbString(),
      net: given.toDbString(),
      availableAt: occurredAt.toISOString(),
      termsId: terms.id,
    };
  }
  const gross = kind === 'sale' ? given.abs() : given.abs().negate();
  const commission = gross.percent(terms.commissionPercent);
  const fee = kind === 'sale' ? Money.from(terms.fixedFee) : Money.zero();
  const net = gross.sub(commission).sub(fee);
  if (kind === 'sale' && net.isNegative())
    throw new RangeError('The sale is smaller than its commission and fee.');
  const hold = kind === 'sale' ? terms.holdDays * DAY_MS : 0;
  return {
    kind,
    gross: gross.toDbString(),
    commission: commission.toDbString(),
    fixedFee: fee.toDbString(),
    net: net.toDbString(),
    availableAt: new Date(occurredAt.getTime() + hold).toISOString(),
    termsId: terms.id,
  };
}

/** The terms in force at a time: the newest version of the sub-merchant that started by then, else the company default, else none. */
export function termsAt<T extends { subMerchantId: string | null; effectiveFrom: string }>(
  versions: readonly T[],
  subMerchantId: string,
  at: Date,
): T | null {
  const started = versions.filter((v) => Date.parse(v.effectiveFrom) <= at.getTime());
  const newest = (list: readonly T[]): T | null =>
    [...list].sort((a, b) => Date.parse(b.effectiveFrom) - Date.parse(a.effectiveFrom))[0] ?? null;
  return (
    newest(started.filter((v) => v.subMerchantId === subMerchantId)) ??
    newest(started.filter((v) => v.subMerchantId === null))
  );
}

/* ---------- the balance (mirror of kd_settlement_balance) ---------- */

export interface BalanceEntry {
  net: string;
  availableAt: string;
}

export interface Balance {
  totalNet: string;
  pending: string;
  paid: string;
  available: string;
}

export function balanceOf(
  entries: readonly BalanceEntry[],
  recordedPayouts: readonly string[],
  now: Date,
): Balance {
  const totalNet = Money.sum(entries.map((e) => Money.parse(e.net)));
  const pending = Money.sum(
    entries
      .filter((e) => Money.parse(e.net).isPositive() && Date.parse(e.availableAt) > now.getTime())
      .map((e) => Money.parse(e.net)),
  );
  const paid = Money.sum(recordedPayouts.map((p) => Money.parse(p)));
  return {
    totalNet: totalNet.toDbString(),
    pending: pending.toDbString(),
    paid: paid.toDbString(),
    available: totalNet.sub(pending).sub(paid).toDbString(),
  };
}

/* ---------- the statement ---------- */

export interface StatementRow {
  occurredAt: string;
  kind: string;
  externalRef: string;
  gross: string;
  commission: string;
  fixedFee: string;
  net: string;
  availableAt: string;
  note: string;
}

const STATEMENT_HEADER = [
  'Date',
  'Kind',
  'Reference',
  'Gross (USD)',
  'Commission (USD)',
  'Fixed fee (USD)',
  'Net (USD)',
  'Payable from',
  'Note',
] as const;

/** The statement of a sub-merchant as CSV (cells that could be read as formulas are made safe). */
export function statementCsv(rows: readonly StatementRow[]): string {
  return toCsv([
    [...STATEMENT_HEADER],
    ...rows.map((r) => [
      r.occurredAt,
      r.kind,
      r.externalRef,
      r.gross,
      r.commission,
      r.fixedFee,
      r.net,
      r.availableAt,
      r.note,
    ]),
  ]);
}

export { SETTLEMENT_ENTRY_KINDS };
