// path: services/taxfiling/tax-rules.ts
// Tax reporting as pure functions: the jurisdiction of a tax code, sales tax by jurisdiction and period, the VAT or GST return
// (tax charged against tax paid on purchases), withholding by payee, the quarterly tax provision, paid against due and the
// reminder stage of a deadline. No database here; every amount is a text amount.
import { z } from 'zod';
import { toInt } from '@/lib/reports/numbers';
import { Money } from '@/lib/utils/currency';
import { dayText } from '@/services/accounting/journal-rules';

const plain = (min: number, max: number): z.ZodString =>
  z
    .string()
    .trim()
    .min(min)
    .max(max)
    .refine((v) => !/[<>]/.test(v), { message: 'Angle brackets are not allowed.' });
const amount = z.string().regex(/^\d{1,14}(\.\d{1,4})?$/, 'Enter an amount like 1000 or 1000.50.');

export const TAX_KINDS = [
  'sales',
  'vat',
  'gst',
  'withholding',
  'income',
  'payroll',
  'other',
] as const;

export const filingSettingsInput = z
  .object({
    version: z.number().int().min(1).optional(),
    provisionRate: z
      .string()
      .regex(
        /^(100(\.0{1,4})?|\d{1,2}(\.\d{1,4})?)$/,
        'Enter a rate from 0 to 100, like 21 or 7.5.',
      ),
    reminderDays: z.number().int().min(0).max(60),
  })
  .strict();

export const paymentInput = z
  .object({
    jurisdiction: plain(1, 60),
    taxKind: z.enum(TAX_KINDS).default('sales'),
    periodStart: dayText,
    periodEnd: dayText,
    amount: amount.regex(/[1-9]/, 'The amount must be above zero.'),
    paidOn: dayText,
    reference: plain(0, 80).default(''),
    note: plain(0, 300).default(''),
  })
  .strict()
  .refine((v) => v.periodEnd >= v.periodStart, {
    message: 'The period cannot end before it starts.',
    path: ['periodEnd'],
  });

export const deadlineInput = z
  .object({
    title: plain(1, 120),
    jurisdiction: plain(0, 60).default(''),
    dueOn: dayText,
    note: plain(0, 300).default(''),
  })
  .strict();

export const deadlineUpdate = z
  .object({
    version: z.number().int().min(1),
    title: plain(1, 120).optional(),
    jurisdiction: plain(0, 60).optional(),
    dueOn: dayText.optional(),
    note: plain(0, 300).optional(),
    status: z.enum(['open', 'done']).optional(),
  })
  .strict();

export interface RateInfo {
  code: string;
  name: string;
  kind: string;
  country: string | null;
  region: string;
}

/** "US-CA" for a country and region, "US" for a country, "Unspecified" when the rate says neither. */
export function jurisdictionOf(rate: Pick<RateInfo, 'country' | 'region'> | undefined): string {
  if (!rate?.country) return 'Unspecified';
  return rate.region ? `${rate.country}-${rate.region.toUpperCase()}` : rate.country;
}

export interface InvoiceTax {
  id: string;
  clientKey: string;
  clientName: string;
  issueDate: string;
  rows: { code: string; name: string; rate: string; base: string; amount: string }[];
  withholdingRate: string;
  withholding: string;
  total: string;
}

export interface TaxLine {
  jurisdiction: string;
  code: string;
  name: string;
  kind: string;
  rate: string;
  invoices: number;
  base: string;
  tax: string;
}

/** Tax charged on invoices by jurisdiction and tax code (and the rate, in case a code changed rate during the period). */
export function salesTaxLines(
  invoices: readonly InvoiceTax[],
  rates: ReadonlyMap<string, RateInfo>,
  kinds?: readonly string[],
): TaxLine[] {
  const groups = new Map<string, { line: TaxLine; ids: Set<string>; base: Money; tax: Money }>();
  for (const inv of invoices) {
    for (const r of inv.rows) {
      const info = rates.get(r.code);
      const kind = info?.kind ?? 'other';
      if (kinds && !kinds.includes(kind)) continue;
      const jurisdiction = jurisdictionOf(info);
      const key = `${jurisdiction}|${r.code}|${r.rate}`;
      const g = groups.get(key) ?? {
        line: {
          jurisdiction,
          code: r.code,
          name: info?.name ?? r.name,
          kind,
          rate: r.rate,
          invoices: 0,
          base: '0',
          tax: '0',
        },
        ids: new Set<string>(),
        base: Money.zero(),
        tax: Money.zero(),
      };
      g.ids.add(inv.id);
      g.base = g.base.add(r.base);
      g.tax = g.tax.add(r.amount);
      groups.set(key, g);
    }
  }
  return [...groups.values()]
    .map((g) => ({
      ...g.line,
      invoices: g.ids.size,
      base: g.base.toDbString(),
      tax: g.tax.toDbString(),
    }))
    .sort((a, b) => a.jurisdiction.localeCompare(b.jurisdiction) || a.code.localeCompare(b.code));
}

export interface InputTaxLine {
  source: 'supplier_bill' | 'expense';
  rate: string;
  base: string;
  tax: string;
}

export interface VatReturn {
  output: TaxLine[];
  outputTax: string;
  outputBase: string;
  input: { rate: string; base: string; tax: string }[];
  inputTax: string;
  inputBase: string;
  /** Output tax less input tax; negative means a refund is due. */
  netPayable: string;
}

/** The VAT or GST return of a period: tax charged, tax paid on purchases and bills, and the net to pay (or to get back). */
export function vatReturn(output: readonly TaxLine[], input: readonly InputTaxLine[]): VatReturn {
  const byRate = new Map<string, { base: Money; tax: Money }>();
  for (const i of input) {
    const g = byRate.get(i.rate) ?? { base: Money.zero(), tax: Money.zero() };
    byRate.set(i.rate, { base: g.base.add(i.base), tax: g.tax.add(i.tax) });
  }
  const inputRows = [...byRate]
    .sort((a, b) => Money.parse(a[0]).cmp(b[0]))
    .map(([rate, g]) => ({ rate, base: g.base.toDbString(), tax: g.tax.toDbString() }));
  const outputTax = Money.sum(output.map((l) => Money.parse(l.tax)));
  const inputTax = Money.sum(inputRows.map((r) => Money.parse(r.tax)));
  return {
    output: [...output],
    outputTax: outputTax.toDbString(),
    outputBase: Money.sum(output.map((l) => Money.parse(l.base))).toDbString(),
    input: inputRows,
    inputTax: inputTax.toDbString(),
    inputBase: Money.sum(inputRows.map((r) => Money.parse(r.base))).toDbString(),
    netPayable: outputTax.sub(inputTax).toDbString(),
  };
}

export interface WithholdingRow {
  payee: string;
  invoices: number;
  gross: string;
  rate: string;
  withheld: string;
}

/** Tax withheld by clients from what they paid, per payer (the client), biggest first. */
export function withholdingByPayee(invoices: readonly InvoiceTax[]): WithholdingRow[] {
  const groups = new Map<
    string,
    { name: string; ids: Set<string>; gross: Money; withheld: Money; rates: Set<string> }
  >();
  for (const inv of invoices) {
    const held = Money.parse(inv.withholding);
    if (!held.isPositive()) continue;
    const g = groups.get(inv.clientKey) ?? {
      name: inv.clientName,
      ids: new Set<string>(),
      gross: Money.zero(),
      withheld: Money.zero(),
      rates: new Set<string>(),
    };
    g.ids.add(inv.id);
    g.gross = g.gross.add(inv.total);
    g.withheld = g.withheld.add(held);
    g.rates.add(inv.withholdingRate);
    groups.set(inv.clientKey, g);
  }
  return [...groups.values()]
    .sort((a, b) =>
      b.withheld.gt(a.withheld) ? 1 : b.withheld.lt(a.withheld) ? -1 : a.name.localeCompare(b.name),
    )
    .map((g) => ({
      payee: g.name,
      invoices: g.ids.size,
      gross: g.gross.toDbString(),
      rate: g.rates.size === 1 ? ([...g.rates][0] ?? '0') : 'mixed',
      withheld: g.withheld.toDbString(),
    }));
}

/** The quarter (1 to 4) of a calendar date. */
export const quarterOf = (day: string): number => {
  const month = toInt(day.slice(5, 7));
  return (month - 1 - ((month - 1) % 3)) / 3 + 1;
};

export interface ProvisionRow {
  quarter: string;
  preTaxIncome: string;
  provision: string;
  cumulative: string;
}

/**
 * The tax provision of each quarter: the rate on a quarter's profit before tax (a loss gives nothing and is not carried forward).
 * The result is an estimate for the owner and the accountant, not a tax return.
 */
export function provision(
  quarters: readonly { quarter: string; preTaxIncome: string }[],
  rate: string,
): ProvisionRow[] {
  let cumulative = Money.zero();
  return quarters.map((q) => {
    const income = Money.parse(q.preTaxIncome);
    const amount = income.isPositive() ? income.mul(rate).div('100') : Money.zero();
    cumulative = cumulative.add(amount);
    return {
      quarter: q.quarter,
      preTaxIncome: income.toDbString(),
      provision: amount.toDbString(),
      cumulative: cumulative.toDbString(),
    };
  });
}

export interface DueRow {
  jurisdiction: string;
  due: string;
  paid: string;
  /** Due less paid; above zero is still owed, below zero is overpaid. */
  balance: string;
}

/** Tax due by jurisdiction against the payments recorded for it. */
export function paidVsDue(
  due: readonly { jurisdiction: string; amount: string }[],
  payments: readonly { jurisdiction: string; amount: string }[],
): DueRow[] {
  const names = new Set([
    ...due.map((d) => d.jurisdiction),
    ...payments.map((p) => p.jurisdiction),
  ]);
  return [...names].sort().map((jurisdiction) => {
    const d = Money.sum(
      due.filter((x) => x.jurisdiction === jurisdiction).map((x) => Money.parse(x.amount)),
    );
    const p = Money.sum(
      payments.filter((x) => x.jurisdiction === jurisdiction).map((x) => Money.parse(x.amount)),
    );
    return {
      jurisdiction,
      due: d.toDbString(),
      paid: p.toDbString(),
      balance: d.sub(p).toDbString(),
    };
  });
}

const DAY = 86_400_000;

/**
 * The reminder to send for a deadline now: 1 when it is within the reminder days, 2 on or after the due day; null when the
 * stage already sent covers it. A done deadline is never reminded.
 */
export function reminderStage(
  dueOn: string,
  today: string,
  reminderDays: number,
  sentStage: number,
  done: boolean,
): 1 | 2 | null {
  if (done) return null;
  const left = (Date.parse(`${dueOn}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / DAY;
  if (left <= 0) return sentStage < 2 ? 2 : null;
  if (left <= reminderDays) return sentStage < 1 ? 1 : null;
  return null;
}
